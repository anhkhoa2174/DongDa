// Prisma Reports Repository — tổng hợp GD WU/MG/FX
// Layer: Infrastructure

import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma.service';
import {
  CashBook,
  CashBookDay,
  CashBookRow,
  CashBookRowKind,
  CompanyDashboard,
  DashboardOperations,
  IReportsRepository,
  ProviderStat,
  ReportFilter,
  TxStats,
} from '../../../domain/repositories/reports.repository';
import { NotFoundException } from '@nestjs/common';

const round2 = (n: number) => Math.round(n * 100) / 100;

@Injectable()
export class PrismaReportsRepository implements IReportsRepository {
  constructor(private readonly prisma: PrismaService) {}

  // Sổ theo dõi thu chi hằng ngày (mẫu Excel sổ quỹ chi nhánh): mỗi ngày 1 nhóm,
  // từng bút toán POSTED chạm sổ tiền mặt VND/USD, tồn chạy dần từ tồn đầu kỳ.
  async dailyCashBook(branchId: string, dateFrom: Date, dateToExclusive: Date): Promise<CashBook> {
    const branch = await this.prisma.branch.findUnique({
      where: { id: branchId }, select: { id: true, code: true, name: true, address: true },
    });
    if (!branch) throw new NotFoundException('Không tìm thấy chi nhánh');

    // Sổ tiền mặt VND/USD của chi nhánh (kể cả INACTIVE để giữ lịch sử).
    const cashAccounts = await this.prisma.fund_accounts.findMany({
      where: { branch_id: branchId, account_type: 'CASH', currency_code: { in: ['USD', 'VND'] } },
      select: { id: true, currency_code: true },
    });
    const accountIds = cashAccounts.map((a) => a.id);
    const currencyOf = new Map(cashAccounts.map((a) => [a.id, String(a.currency_code)]));

    // Tồn đầu kỳ = tổng ledger trước ngày bắt đầu.
    let openingUsd = 0;
    let openingVnd = 0;
    if (accountIds.length) {
      const before = await this.prisma.ledger_lines.findMany({
        where: {
          fund_account_id: { in: accountIds },
          ledger_entries: { status: 'POSTED', business_date: { lt: dateFrom } },
        },
        select: { fund_account_id: true, direction: true, amount: true },
      });
      for (const l of before) {
        const signed = (l.direction === 'DEBIT' ? 1 : -1) * Number(l.amount);
        if (currencyOf.get(l.fund_account_id) === 'USD') openingUsd += signed; else openingVnd += signed;
      }
    }

    // Bút toán trong kỳ.
    const entries = accountIds.length ? await this.prisma.ledger_entries.findMany({
      where: {
        status: 'POSTED',
        business_date: { gte: dateFrom, lt: dateToExclusive },
        ledger_lines: { some: { fund_account_id: { in: accountIds } } },
      },
      include: { ledger_lines: { where: { fund_account_id: { in: accountIds } } } },
      orderBy: [{ business_date: 'asc' }, { posted_at: 'asc' }, { created_at: 'asc' }],
    }) : [];

    // Nạp thông tin nguồn theo lô để đặt tên dòng (MTCN/tên khách, số phiếu...).
    const idsBy = (type: string) => entries.filter((e) => e.source_type === type).map((e) => e.source_id);
    const [txs, transfers, cashMovements] = await Promise.all([
      this.prisma.customer_transactions.findMany({
        where: { id: { in: idsBy('CUSTOMER_TRANSACTION') } },
        include: { wu_transaction_details: { select: { mtcn: true } }, mg_transaction_details: { select: { reference_no: true } } },
      }),
      this.prisma.fund_transfers.findMany({
        where: { id: { in: idsBy('FUND_TRANSFER') } },
        include: {
          branches_fund_transfers_source_branch_idTobranches: { select: { code: true, name: true } },
          branches_fund_transfers_destination_branch_idTobranches: { select: { code: true, name: true } },
        },
      }),
      this.prisma.cash_movements.findMany({ where: { id: { in: idsBy('CASH_MOVEMENT') } } }),
    ]);
    const txById = new Map(txs.map((t) => [t.id, t]));
    const transferById = new Map(transfers.map((t) => [t.id, t]));
    const cashById = new Map(cashMovements.map((m) => [m.id, m]));

    const days = new Map<string, CashBookDay>();
    let balUsd = openingUsd;
    let balVnd = openingVnd;
    const dayKey = (d: Date) => d.toISOString().slice(0, 10);

    for (const e of entries) {
      let inUsd = 0, inVnd = 0, outUsd = 0, outVnd = 0;
      for (const l of e.ledger_lines) {
        const amt = Number(l.amount);
        const usd = currencyOf.get(l.fund_account_id) === 'USD';
        if (l.direction === 'DEBIT') { if (usd) inUsd += amt; else inVnd += amt; }
        else { if (usd) outUsd += amt; else outVnd += amt; }
      }
      if (!inUsd && !inVnd && !outUsd && !outVnd) continue;
      balUsd = round2(balUsd + inUsd - outUsd);
      balVnd = round2(balVnd + inVnd - outVnd);

      const inflow = inUsd + inVnd > 0;
      let kind: CashBookRowKind = 'OTHER';
      let code = e.entry_no;
      let name = '';
      let description = e.description ?? '';
      if (e.reversed_entry_id) {
        kind = 'REVERSAL';
        description = description || 'Bút toán đảo (hủy/điều chỉnh)';
      }
      switch (e.source_type) {
        case 'CUSTOMER_TRANSACTION': {
          const t = txById.get(e.source_id);
          if (t) {
            if (kind !== 'REVERSAL') kind = t.operation_code as CashBookRowKind;
            code = t.wu_transaction_details?.mtcn ?? t.mg_transaction_details?.reference_no ?? t.transaction_no ?? code;
            name = t.customer_name ?? '';
            if (kind === 'REVERSAL') description = `${description} · ${t.operation_code} ${code}`;
          }
          break;
        }
        case 'FUND_TRANSFER': {
          const tr = transferById.get(e.source_id);
          if (kind !== 'REVERSAL') kind = inflow ? 'FUND_IN' : 'FUND_OUT';
          if (tr) {
            code = tr.transfer_no ?? code;
            const src = tr.branches_fund_transfers_source_branch_idTobranches;
            const dst = tr.branches_fund_transfers_destination_branch_idTobranches;
            name = inflow ? `Nhận tiếp quỹ từ ${src?.name ?? '—'}` : `Gửi tiếp quỹ đến ${dst?.name ?? '—'}`;
          } else {
            name = inflow ? 'Nhận tiếp quỹ' : 'Gửi tiếp quỹ';
          }
          break;
        }
        case 'CASH_MOVEMENT': {
          const m = cashById.get(e.source_id);
          if (kind !== 'REVERSAL') kind = inflow ? 'CASH_IN' : 'CASH_OUT';
          if (m) {
            code = m.movement_no ?? code;
            name = m.source_name ?? '';
            description = description || m.description || '';
          }
          break;
        }
        case 'DEBT_MOVEMENT':
          if (kind !== 'REVERSAL') kind = 'DEBT_SETTLEMENT';
          name = name || 'Công nợ WU/MG về bằng tiền mặt';
          break;
        default:
          break;
      }

      const row: CashBookRow = {
        time: e.posted_at ?? e.created_at,
        kind, code, name, description,
        inUsd, inVnd, outUsd, outVnd,
        balanceUsd: balUsd, balanceVnd: balVnd,
      };
      const key = dayKey(e.business_date);
      let day = days.get(key);
      if (!day) {
        day = {
          date: key,
          openingUsd: round2(balUsd - inUsd + outUsd),
          openingVnd: round2(balVnd - inVnd + outVnd),
          rows: [], totalInUsd: 0, totalInVnd: 0, totalOutUsd: 0, totalOutVnd: 0,
          closingUsd: balUsd, closingVnd: balVnd,
        };
        days.set(key, day);
      }
      day.rows.push(row);
      day.totalInUsd = round2(day.totalInUsd + inUsd);
      day.totalInVnd = round2(day.totalInVnd + inVnd);
      day.totalOutUsd = round2(day.totalOutUsd + outUsd);
      day.totalOutVnd = round2(day.totalOutVnd + outVnd);
      day.closingUsd = balUsd;
      day.closingVnd = balVnd;
    }

    // Ngày không phát sinh vẫn hiện (tồn = tồn cuối ngày trước) để sổ liên tục.
    const out: CashBookDay[] = [];
    let carryUsd = openingUsd;
    let carryVnd = openingVnd;
    for (let d = new Date(dateFrom); d < dateToExclusive; d = this.addUtcDays(d, 1)) {
      const key = dayKey(d);
      const day = days.get(key) ?? {
        date: key, openingUsd: carryUsd, openingVnd: carryVnd, rows: [],
        totalInUsd: 0, totalInVnd: 0, totalOutUsd: 0, totalOutVnd: 0, closingUsd: carryUsd, closingVnd: carryVnd,
      };
      out.push(day);
      carryUsd = day.closingUsd;
      carryVnd = day.closingVnd;
    }

    return {
      branch: { id: branch.id, code: branch.code, name: branch.name, address: branch.address },
      dateFrom: dayKey(dateFrom),
      dateTo: dayKey(this.addUtcDays(dateToExclusive, -1)),
      days: out,
    };
  }

  async txStats(filter?: ReportFilter): Promise<TxStats> {
    return {
      wu: await this.providerStat('WU', filter),
      mg: await this.providerStat('MG', filter),
      fx: await this.fxStat(filter),
    };
  }

  async dashboardOperations(businessDate: Date): Promise<DashboardOperations> {
    const from = new Date(Date.UTC(
      businessDate.getUTCFullYear(),
      businessDate.getUTCMonth(),
      businessDate.getUTCDate(),
    ));
    const to = new Date(Date.UTC(from.getUTCFullYear(), from.getUTCMonth(), from.getUTCDate() + 1));
    const [transactions, pendingVariances, branches, openShifts] = await Promise.all([
      this.prisma.customer_transactions.findMany({
        where: {
          business_date: { gte: from, lt: to },
          status: 'COMPLETED',
          operation_code: { in: ['WU', 'MG', 'FX', 'DOMESTIC_TRANSFER'] },
        },
        include: { wu_transaction_details: true, mg_transaction_details: true },
      }),
      this.prisma.reconciliation_items.findMany({
        where: {
          resolved_at: null,
          status: { in: ['MISSING_IN_SYSTEM', 'MISSING_IN_JOURNAL', 'AMOUNT_VARIANCE', 'BRANCH_VARIANCE'] },
        },
        select: { variance_amount: true },
      }),
      this.prisma.branch.findMany({
        where: { status: 'ACTIVE', type: 'BRANCH' },
        select: { id: true, name: true },
        orderBy: { code: 'asc' },
      }),
      this.prisma.shifts.findMany({
        where: {
          business_date: { gte: from, lt: to },
          status: { in: ['OPEN', 'ACTIVE'] },
          branches: { status: 'ACTIVE', type: 'BRANCH' },
        },
        select: { branch_id: true },
        distinct: ['branch_id'],
      }),
    ]);

    const sourceCounts = { wu: 0, mg: 0, fx: 0, domestic: 0 };
    let transactionValueVnd = 0;
    for (const transaction of transactions as any[]) {
      if (transaction.operation_code === 'WU') sourceCounts.wu += 1;
      else if (transaction.operation_code === 'MG') sourceCounts.mg += 1;
      else if (transaction.operation_code === 'FX') sourceCounts.fx += 1;
      else if (transaction.operation_code === 'DOMESTIC_TRANSFER') sourceCounts.domestic += 1;
      transactionValueVnd += this.transactionValueVnd(transaction);
    }

    const majorVarianceCount = pendingVariances.filter(
      (variance) => Math.abs(Number(variance.variance_amount)) >= 1_000_000,
    ).length;
    const openBranchIds = new Set(openShifts.map((shift) => shift.branch_id));

    return {
      businessDate: from,
      transactionCount: transactions.length,
      transactionValueVnd,
      sourceCounts,
      pendingVarianceCount: pendingVariances.length,
      majorVarianceCount,
      minorVarianceCount: pendingVariances.length - majorVarianceCount,
      openBranchCount: openBranchIds.size,
      totalBranchCount: branches.length,
      closedBranches: branches.filter((branch) => !openBranchIds.has(branch.id)).map((branch) => branch.name),
    };
  }

  async companyDashboard(businessDate: Date): Promise<CompanyDashboard> {
    const dayStart = this.utcDay(businessDate);
    const dayEnd = this.addUtcDays(dayStart, 1);
    const sevenDayStart = this.addUtcDays(dayStart, -6);
    const now = new Date();

    const [operations, transactions, accounts, bankAccounts, debtAccounts, branches, openShifts, variances, rates, historicalRates] = await Promise.all([
      this.dashboardOperations(dayStart),
      this.prisma.customer_transactions.findMany({
        where: {
          business_date: { gte: sevenDayStart, lt: dayEnd },
          status: 'COMPLETED',
          operation_code: { in: ['WU', 'MG', 'FX', 'DOMESTIC_TRANSFER'] },
        },
        include: { wu_transaction_details: true, mg_transaction_details: true },
      }),
      this.prisma.fund_accounts.findMany({
        where: { status: 'ACTIVE', account_type: { in: ['CASH', 'FUND_A'] } },
        include: {
          ledger_lines: {
            where: { ledger_entries: { status: 'POSTED' } },
            select: {
              direction: true,
              amount: true,
              ledger_entries: { select: { business_date: true } },
            },
          },
        },
      }),
      this.prisma.bank_accounts.findMany({
        where: { status: 'ACTIVE' },
        select: {
          current_balance: true,
          opening_balance: true,
          currency_code: true,
          created_at: true,
          bank_balance_movements: {
            where: { status: 'POSTED', business_date: { lt: dayEnd } },
            orderBy: [{ business_date: 'asc' }, { occurred_at: 'asc' }, { created_at: 'asc' }],
            select: { business_date: true, balance_after: true },
          },
        },
      }),
      this.prisma.debt_accounts.findMany({
        where: { status: 'ACTIVE' },
        include: {
          debt_movements: {
            where: { status: 'POSTED' },
            select: { movement_type: true, amount: true, business_date: true },
          },
        },
      }),
      this.prisma.branch.findMany({
        where: { status: 'ACTIVE', type: 'BRANCH' },
        include: {
          employees: {
            where: { status: 'ACTIVE' },
            include: { users: { include: { user_roles: { include: { roles: true } } } } },
          },
        },
        orderBy: { code: 'asc' },
      }),
      this.prisma.shifts.findMany({
        where: {
          business_date: { gte: dayStart, lt: dayEnd },
          status: { in: ['OPEN', 'ACTIVE'] },
          branches: { status: 'ACTIVE', type: 'BRANCH' },
        },
        select: { branch_id: true },
        distinct: ['branch_id'],
      }),
      this.prisma.reconciliation_items.findMany({
        where: {
          resolved_at: null,
          status: { in: ['MISSING_IN_SYSTEM', 'MISSING_IN_JOURNAL', 'AMOUNT_VARIANCE', 'BRANCH_VARIANCE'] },
        },
        select: { branch_id: true, variance_amount: true },
      }),
      this.prisma.exchange_rates.findMany({
        where: {
          status: 'ACTIVE',
          effective_from: { lte: now },
          OR: [{ effective_to: null }, { effective_to: { gt: now } }],
        },
        orderBy: { effective_from: 'desc' },
      }),
      this.prisma.exchange_rates.findMany({
        where: {
          status: { in: ['ACTIVE', 'SUPERSEDED'] },
          approved_at: { not: null, lt: dayEnd },
          effective_from: { lt: dayEnd },
        },
        orderBy: [{ approved_at: 'desc' }, { effective_from: 'desc' }],
      }),
    ]);

    const rateByIdentity = new Map<string, number>();
    for (const rate of rates) {
      const key = `${rate.rate_type}:${rate.from_currency}`;
      if (!rateByIdentity.has(key)) rateByIdentity.set(key, Number(rate.rate));
    }
    const conversionRate = (currency: string) => {
      if (currency === 'VND') return 1;
      if (currency === 'USD') return rateByIdentity.get('PAID_BUY:USD') ?? rateByIdentity.get('FX_BUY:USD') ?? 0;
      return rateByIdentity.get(`FX_BUY:${currency}`) ?? 0;
    };

    const branchCash = new Map<string, { vnd: number; usd: number }>();
    let cashVnd = 0;
    let cashUsd = 0;
    let cashValueVnd = 0;
    let fundAValueVnd = 0;
    for (const account of accounts) {
      const balance = account.ledger_lines.reduce((sum, line) => {
        const amount = Number(line.amount);
        return sum + (line.direction === 'DEBIT' ? amount : -amount);
      }, 0);
      if (account.account_type === 'CASH') {
        cashValueVnd += balance * conversionRate(account.currency_code);
        if (account.currency_code === 'VND') cashVnd += balance;
        if (account.currency_code === 'USD') cashUsd += balance;
        const branch = branchCash.get(account.branch_id) ?? { vnd: 0, usd: 0 };
        if (account.currency_code === 'VND') branch.vnd += balance;
        if (account.currency_code === 'USD') branch.usd += balance;
        branchCash.set(account.branch_id, branch);
      } else {
        fundAValueVnd += balance * conversionRate(account.currency_code);
      }
    }

    const bankValueVnd = bankAccounts.reduce(
      (sum, account) => sum + Number(account.current_balance) * conversionRate(account.currency_code),
      0,
    );
    const debtValueVnd = debtAccounts.reduce((total, account) => {
      let outstanding = 0;
      for (const movement of account.debt_movements) {
        const amount = Number(movement.amount);
        if (movement.movement_type === 'EXPECTED_DEBT' || movement.movement_type === 'ACTUAL_DEBT') outstanding += amount;
        else if (movement.movement_type === 'SETTLEMENT' || movement.movement_type === 'REVERSAL') outstanding -= amount;
      }
      return total + outstanding * conversionRate(account.currency_code);
    }, 0);
    const totalCapitalVnd = cashValueVnd + fundAValueVnd + bankValueVnd + debtValueVnd;

    const transactionsByBranch = new Map<string, { count: number; transactionValueVnd: number }>();
    const transactionValueByDate = new Map<string, number>();
    for (const transaction of transactions as any[]) {
      const dateKey = transaction.business_date.toISOString().slice(0, 10);
      const transactionValueVnd = this.transactionValueVnd(transaction);
      transactionValueByDate.set(dateKey, (transactionValueByDate.get(dateKey) ?? 0) + transactionValueVnd);
      if (dateKey === dayStart.toISOString().slice(0, 10)) {
        const branch = transactionsByBranch.get(transaction.branch_id) ?? { count: 0, transactionValueVnd: 0 };
        branch.count += 1;
        branch.transactionValueVnd += transactionValueVnd;
        transactionsByBranch.set(transaction.branch_id, branch);
      }
    }

    const transactionValueTrend = Array.from({ length: 7 }, (_, index) => {
      const date = this.addUtcDays(sevenDayStart, index);
      const key = date.toISOString().slice(0, 10);
      return {
        date: key,
        label: new Intl.DateTimeFormat('vi-VN', { weekday: 'short', timeZone: 'UTC' }).format(date),
        valueVnd: transactionValueByDate.get(key) ?? 0,
      };
    });

    const openBranchIds = new Set(openShifts.map((shift) => shift.branch_id));
    const varianceByBranch = new Map<string, number>();
    for (const variance of variances) {
      if (!variance.branch_id) continue;
      varianceByBranch.set(
        variance.branch_id,
        (varianceByBranch.get(variance.branch_id) ?? 0) + Number(variance.variance_amount),
      );
    }
    const branchRows = branches.map((branch) => {
      const manager = branch.employees.find((employee) =>
        employee.users?.user_roles.some((userRole) => userRole.roles.code === 'MANAGER'));
      const cash = branchCash.get(branch.id) ?? { vnd: 0, usd: 0 };
      const transaction = transactionsByBranch.get(branch.id) ?? { count: 0, transactionValueVnd: 0 };
      const discrepancyValueVnd = varianceByBranch.get(branch.id) ?? 0;
      const absDiscrepancy = Math.abs(discrepancyValueVnd);
      const shiftStatus = openBranchIds.has(branch.id) ? 'open' as const : 'closed' as const;
      const discrepancy = absDiscrepancy >= 1_000_000
        ? 'danger' as const
        : absDiscrepancy > 0 ? 'warning' as const : 'matched' as const;
      const riskLevel = discrepancy === 'danger' || cash.vnd < 0 || cash.usd < 0
        ? 'risk' as const
        : discrepancy === 'warning' || shiftStatus === 'closed' ? 'watch' as const : 'normal' as const;
      return {
        id: branch.id,
        code: branch.code,
        name: branch.name,
        manager: manager?.full_name ?? null,
        shiftStatus,
        vndBalance: cash.vnd,
        usdBalance: cash.usd,
        todayTransactions: transaction.count,
        transactionValueTodayVnd: transaction.transactionValueVnd,
        discrepancy,
        discrepancyValueVnd,
        riskLevel,
      };
    });

    const capitalTrend = Array.from({ length: 7 }, (_, index) => {
      const date = this.addUtcDays(sevenDayStart, index);
      const cutoff = this.addUtcDays(date, 1);
      const key = date.toISOString().slice(0, 10);
      const valueVnd = key === dayStart.toISOString().slice(0, 10)
        ? totalCapitalVnd
        : this.historicalCapitalValueVnd(cutoff, accounts, bankAccounts, debtAccounts, historicalRates);
      return { date: key, valueVnd };
    });
    const previousCapital = capitalTrend[5]?.valueVnd || null;
    const changeValueVnd = previousCapital === null ? null : totalCapitalVnd - previousCapital;
    const changePercent = previousCapital ? (changeValueVnd! / previousCapital) * 100 : null;

    return {
      businessDate: dayStart,
      overview: {
        totalCapitalVnd,
        cashVnd,
        cashUsd,
        cashValueVnd,
        fundAValueVnd,
        bankValueVnd,
        debtValueVnd,
        changePercent,
        changeValueVnd,
        capitalTrend,
      },
      operations,
      transactionValueTrend,
      transactionMix: [
        { source: 'WU', count: operations.sourceCounts.wu },
        { source: 'MG', count: operations.sourceCounts.mg },
        { source: 'FX', count: operations.sourceCounts.fx },
        { source: 'DOMESTIC', count: operations.sourceCounts.domestic },
      ],
      branches: branchRows,
      activeRates: rates.map((rate) => ({
        id: rate.id,
        rateType: rate.rate_type,
        provider: rate.provider,
        fromCurrency: rate.from_currency,
        toCurrency: rate.to_currency,
        rate: Number(rate.rate),
        buyRate: rate.buy_rate === null ? null : Number(rate.buy_rate),
        sellRate: rate.sell_rate === null ? null : Number(rate.sell_rate),
        margin: Number(rate.margin ?? 0),
        effectiveFrom: rate.effective_from,
        approvedAt: rate.approved_at,
      })),
      ratesUpdatedAt: rates.reduce<Date | null>(
        (latest, rate) => !latest || rate.updated_at > latest ? rate.updated_at : latest,
        null,
      ),
    };
  }

  private historicalCapitalValueVnd(
    cutoff: Date,
    accounts: any[],
    bankAccounts: any[],
    debtAccounts: any[],
    rates: any[],
  ) {
    const rateAt = (rateType: string, currency: string) => {
      const rate = rates.find((item) => (
        item.rate_type === rateType
        && item.from_currency === currency
        && item.approved_at < cutoff
        && item.effective_from < cutoff
      ));
      return rate ? Number(rate.rate) : 0;
    };
    const conversionRate = (currency: string) => {
      if (currency === 'VND') return 1;
      if (currency === 'USD') return rateAt('PAID_BUY', 'USD') || rateAt('FX_BUY', 'USD');
      return rateAt('FX_BUY', currency);
    };

    const fundValueVnd = accounts.reduce((total, account) => {
      const balance = account.ledger_lines.reduce((sum: number, line: any) => {
        if (line.ledger_entries.business_date >= cutoff) return sum;
        const amount = Number(line.amount);
        return sum + (line.direction === 'DEBIT' ? amount : -amount);
      }, 0);
      return total + balance * conversionRate(account.currency_code);
    }, 0);

    const bankValueVnd = bankAccounts.reduce((total, account) => {
      if (account.created_at >= cutoff) return total;
      const movements = account.bank_balance_movements.filter((movement: any) => movement.business_date < cutoff);
      const balance = movements.length > 0
        ? Number(movements[movements.length - 1].balance_after)
        : Number(account.opening_balance);
      return total + balance * conversionRate(account.currency_code);
    }, 0);

    const debtValueVnd = debtAccounts.reduce((total, account) => {
      const outstanding = account.debt_movements.reduce((sum: number, movement: any) => {
        if (movement.business_date >= cutoff) return sum;
        const amount = Number(movement.amount);
        if (movement.movement_type === 'EXPECTED_DEBT' || movement.movement_type === 'ACTUAL_DEBT') return sum + amount;
        if (movement.movement_type === 'SETTLEMENT' || movement.movement_type === 'REVERSAL') return sum - amount;
        return sum;
      }, 0);
      return total + outstanding * conversionRate(account.currency_code);
    }, 0);

    return fundValueVnd + bankValueVnd + debtValueVnd;
  }

  private async providerStat(provider: 'WU' | 'MG', filter?: ReportFilter): Promise<ProviderStat> {
    const rows = await this.prisma.customer_transactions.findMany({
      where: {
        operation_code: provider, status: 'COMPLETED',
        ...(filter?.branchId && { branch_id: filter.branchId }),
        ...((filter?.dateFrom || filter?.dateToExclusive) && { business_date: {
          ...(filter.dateFrom && { gte: filter.dateFrom }),
          ...(filter.dateToExclusive && { lt: filter.dateToExclusive }),
        }}),
      },
      include: provider === 'WU'
        ? { wu_transaction_details: true }
        : { mg_transaction_details: true },
    });
    let totalUsd = 0, totalVnd = 0, transactionValueVnd = 0, debtGeneratedUsd = 0, debtGeneratedVnd = 0;
    for (const r of rows as any[]) {
      const usd = Number(r.amount);
      const vnd = Number(r.vnd_amount);
      totalUsd += usd;
      totalVnd += vnd;
      transactionValueVnd += this.transactionValueVnd(r);
      const detail = provider === 'WU' ? r.wu_transaction_details : r.mg_transaction_details;
      if (detail?.paid_currency === 'USD') debtGeneratedUsd += usd;
      if (detail?.paid_currency === 'VND') debtGeneratedVnd += vnd;
    }
    return { count: rows.length, totalUsd, totalVnd, transactionValueVnd, debtGeneratedUsd, debtGeneratedVnd };
  }

  private async fxStat(filter?: ReportFilter) {
    const rows = await this.prisma.customer_transactions.findMany({
      where: {
        operation_code: 'FX', status: 'COMPLETED',
        ...(filter?.branchId && { branch_id: filter.branchId }),
        ...((filter?.dateFrom || filter?.dateToExclusive) && { business_date: {
          ...(filter.dateFrom && { gte: filter.dateFrom }),
          ...(filter.dateToExclusive && { lt: filter.dateToExclusive }),
        }}),
      },
      include: { fx_transaction_details: true },
    });
    let buyCount = 0, sellCount = 0, buyVnd = 0, sellVnd = 0;
    for (const r of rows as any[]) {
      const vnd = Number(r.vnd_amount);
      if (r.fx_transaction_details?.is_buy) { buyCount++; buyVnd += vnd; }
      else { sellCount++; sellVnd += vnd; }
    }
    return { buyCount, sellCount, buyVnd, sellVnd };
  }

  private transactionValueVnd(transaction: any): number {
    if (transaction.operation_code === 'WU' && transaction.wu_transaction_details) {
      const detail = transaction.wu_transaction_details;
      return Number(detail.received_usd) * Number(detail.applied_rate) + Number(detail.received_vnd);
    }
    if (transaction.operation_code === 'MG' && transaction.mg_transaction_details) {
      const detail = transaction.mg_transaction_details;
      return Number(detail.received_usd) * Number(detail.applied_rate) + Number(detail.received_vnd);
    }
    return Number(transaction.vnd_amount);
  }

  private utcDay(date: Date): Date {
    return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
  }

  private addUtcDays(date: Date, days: number): Date {
    return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate() + days));
  }
}
