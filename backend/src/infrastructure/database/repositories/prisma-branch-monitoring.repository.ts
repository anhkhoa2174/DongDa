import { Injectable, NotFoundException } from '@nestjs/common';
import {
  BranchActivityMonitoring,
  BranchFundMonitoring,
  IBranchMonitoringRepository,
  MonitoringBranch,
  MonitoringPeriod,
} from '../../../domain/repositories/branch-monitoring.repository';
import { PrismaService } from '../prisma.service';

const CURRENCY_NAMES: Record<string, string> = {
  USD: 'Đô la Mỹ', EUR: 'Euro', AUD: 'Đô la Úc', JPY: 'Yên Nhật', GBP: 'Bảng Anh',
  SGD: 'Đô la Singapore', THB: 'Baht Thái', CNY: 'Nhân dân tệ', HKD: 'Đô la Hong Kong',
  KRW: 'Won Hàn Quốc', CAD: 'Đô la Canada', CHF: 'Franc Thụy Sĩ', NZD: 'Đô la New Zealand',
  TWD: 'Đài tệ', MYR: 'Ringgit Malaysia', IDR: 'Rupiah Indonesia', PHP: 'Peso Philippines',
  LAK: 'Kip Lào', KHR: 'Riel Campuchia',
};

@Injectable()
export class PrismaBranchMonitoringRepository implements IBranchMonitoringRepository {
  constructor(private readonly prisma: PrismaService) {}

  async listBranches(): Promise<MonitoringBranch[]> {
    const branches = await this.prisma.branch.findMany({
      where: { status: 'ACTIVE', type: 'BRANCH' },
      include: {
        employees: {
          where: { status: 'ACTIVE' },
          include: { users: { include: { user_roles: { include: { roles: true } } } } },
        },
      },
      orderBy: { code: 'asc' },
    });

    return branches.map((branch) => {
      const manager = branch.employees.find((employee) =>
        employee.users?.user_roles.some((userRole) => userRole.roles.code === 'MANAGER'));
      return {
        id: branch.id,
        code: branch.code,
        name: branch.name,
        managerName: manager?.full_name ?? null,
        employeeCount: branch.employees.length,
      };
    });
  }

  async getFunds(branchId: string): Promise<BranchFundMonitoring> {
    await this.ensureBranch(branchId);
    const now = new Date();
    const [accounts, rates, openShift, lastCashCount, pendingTransferCount] = await Promise.all([
      this.prisma.fund_accounts.findMany({
        where: { branch_id: branchId, status: 'ACTIVE', account_type: { in: ['CASH', 'FUND_A'] } },
        include: {
          ledger_lines: {
            where: { ledger_entries: { status: 'POSTED' } },
            select: { direction: true, amount: true },
          },
        },
      }),
      this.prisma.exchange_rates.findMany({
        where: {
          status: 'ACTIVE',
          to_currency: 'VND',
          rate_type: { in: ['PAID_BUY', 'FX_BUY'] },
          effective_from: { lte: now },
          OR: [{ effective_to: null }, { effective_to: { gt: now } }],
        },
        orderBy: { effective_from: 'desc' },
      }),
      this.prisma.shifts.findFirst({
        where: { branch_id: branchId, status: { in: ['OPEN', 'ACTIVE'] } },
        include: {
          users_shifts_opened_by_user_idTousers: { include: { employees: true } },
        },
        orderBy: { opened_at: 'desc' },
      }),
      this.prisma.cash_counts.findFirst({
        where: { branch_id: branchId },
        include: { cash_count_lines: true },
        orderBy: { counted_at: 'desc' },
      }),
      this.prisma.fund_transfers.count({
        where: {
          destination_branch_id: branchId,
          status: { in: ['PENDING_APPROVAL', 'APPROVED', 'IN_TRANSIT'] },
        },
      }),
    ]);

    const balanceByAccount = new Map<string, number>();
    for (const account of accounts) {
      balanceByAccount.set(account.id, account.ledger_lines.reduce((sum, line) => {
        const amount = Number(line.amount);
        return sum + (line.direction === 'DEBIT' ? amount : -amount);
      }, 0));
    }

    const paidBuyUsd = rates.find((rate) => rate.rate_type === 'PAID_BUY' && rate.from_currency === 'USD');
    const fxRateByCurrency = new Map<string, number>();
    for (const rate of rates) {
      if (rate.rate_type === 'FX_BUY' && !fxRateByCurrency.has(rate.from_currency)) {
        fxRateByCurrency.set(rate.from_currency, Number(rate.rate));
      }
    }
    const usdBuyRate = Number(paidBuyUsd?.rate ?? fxRateByCurrency.get('USD') ?? 0);
    const vndCash = this.accountBalance(accounts, balanceByAccount, 'CASH', 'VND');
    const usdCash = this.accountBalance(accounts, balanceByAccount, 'CASH', 'USD');
    const fundA = accounts
      .filter((account) => account.account_type === 'FUND_A')
      .map((account) => {
        const amount = balanceByAccount.get(account.id) ?? 0;
        const buyRate = fxRateByCurrency.get(account.currency_code) ?? 0;
        return {
          currency: account.currency_code,
          name: CURRENCY_NAMES[account.currency_code] ?? account.name,
          amount,
          buyRate,
          vndValue: amount * buyRate,
        };
      })
      .sort((a, b) => a.currency.localeCompare(b.currency));
    const fundAValueVnd = fundA.reduce((sum, balance) => sum + balance.vndValue, 0);
    const hasVariance = lastCashCount?.cash_count_lines.some((line) => Number(line.variance) !== 0) ?? false;
    const hasNegativeBalance = Array.from(balanceByAccount.values()).some((balance) => balance < 0);
    const status = hasVariance
      ? 'NEEDS_RECONCILIATION' as const
      : hasNegativeBalance ? 'LOW_CASH' as const : 'NORMAL' as const;

    return {
      branchId,
      vndCash,
      usdCash,
      usdBuyRate,
      fundA,
      fundAValueVnd,
      currentFundValueVnd: vndCash + usdCash * usdBuyRate + fundAValueVnd,
      openShift: openShift ? {
        id: openShift.id,
        code: openShift.shift_code,
        cashier: openShift.users_shifts_opened_by_user_idTousers.employees.full_name,
        openedAt: openShift.opened_at,
      } : null,
      lastCashCountAt: lastCashCount?.counted_at ?? null,
      pendingTransferCount,
      status,
    };
  }

  async getActivity(
    branchId: string,
    period: MonitoringPeriod,
    anchorDate: Date,
  ): Promise<BranchActivityMonitoring> {
    await this.ensureBranch(branchId);
    const { from, to } = this.periodRange(period, anchorDate);
    const [transactions, movementLines] = await Promise.all([
      this.prisma.customer_transactions.findMany({
        where: {
          branch_id: branchId,
          business_date: { gte: from, lt: to },
          status: { in: ['COMPLETED', 'VOIDED'] },
          operation_code: { in: ['WU', 'MG', 'FX', 'DOMESTIC_TRANSFER'] },
        },
        include: {
          wu_transaction_details: true,
          mg_transaction_details: true,
          fx_transaction_details: true,
        },
        orderBy: { created_at: 'asc' },
      }),
      this.prisma.ledger_lines.findMany({
        where: {
          fund_accounts: {
            branch_id: branchId,
            status: 'ACTIVE',
            account_type: { in: ['CASH', 'FUND_A'] },
          },
          ledger_entries: {
            status: 'POSTED',
            business_date: { gte: from, lt: to },
          },
        },
        select: {
          direction: true,
          base_amount_vnd: true,
          ledger_entries: { select: { business_date: true, created_at: true } },
        },
      }),
    ]);

    const completed = transactions.filter((transaction) => transaction.status === 'COMPLETED');
    const sourceTotals = new Map<string, { count: number; valueVnd: number }>();
    const trendTotals = new Map<string, {
      count: number;
      valueVnd: number;
      moneyInVnd: number;
      moneyOutVnd: number;
      sort: string;
    }>();
    let transactionValueVnd = 0;
    let moneyInVnd = 0;
    let moneyOutVnd = 0;

    for (const line of movementLines) {
      const amountVnd = Number(line.base_amount_vnd);
      if (line.direction === 'DEBIT') moneyInVnd += amountVnd;
      else moneyOutVnd += amountVnd;

      const bucket = this.trendBucket(
        period,
        line.ledger_entries.created_at,
        line.ledger_entries.business_date,
      );
      const trendTotal = trendTotals.get(bucket.label) ?? {
        count: 0,
        valueVnd: 0,
        moneyInVnd: 0,
        moneyOutVnd: 0,
        sort: bucket.sort,
      };
      if (line.direction === 'DEBIT') trendTotal.moneyInVnd += amountVnd;
      else trendTotal.moneyOutVnd += amountVnd;
      trendTotals.set(bucket.label, trendTotal);
    }

    for (const transaction of completed) {
      const source = this.sourceOf(transaction.operation_code);
      const valueVnd = this.transactionValue(transaction);
      transactionValueVnd += valueVnd;

      const sourceTotal = sourceTotals.get(source) ?? { count: 0, valueVnd: 0 };
      sourceTotal.count += 1;
      sourceTotal.valueVnd += valueVnd;
      sourceTotals.set(source, sourceTotal);

      const bucket = this.trendBucket(period, transaction.created_at, transaction.business_date);
      const trendTotal = trendTotals.get(bucket.label) ?? {
        count: 0,
        valueVnd: 0,
        moneyInVnd: 0,
        moneyOutVnd: 0,
        sort: bucket.sort,
      };
      trendTotal.count += 1;
      trendTotal.valueVnd += valueVnd;
      trendTotals.set(bucket.label, trendTotal);
    }

    return {
      branchId,
      period,
      from,
      to,
      transactionCount: transactions.length,
      completedCount: completed.length,
      transactionValueVnd,
      moneyInVnd,
      moneyOutVnd,
      sourceMix: Array.from(sourceTotals.entries()).map(([source, total]) => ({
        source: source as 'WU' | 'MG' | 'FX' | 'DOMESTIC',
        ...total,
      })),
      trend: Array.from(trendTotals.entries())
        .map(([label, total]) => ({
          label,
          transactionCount: total.count,
          transactionValueVnd: total.valueVnd,
          moneyInVnd: total.moneyInVnd,
          moneyOutVnd: total.moneyOutVnd,
          sort: total.sort,
        }))
        .sort((a, b) => a.sort.localeCompare(b.sort))
        .map(({ sort: _sort, ...point }) => point),
    };
  }

  private async ensureBranch(branchId: string) {
    const branch = await this.prisma.branch.findFirst({
      where: { id: branchId, status: 'ACTIVE', type: 'BRANCH' },
      select: { id: true },
    });
    if (!branch) throw new NotFoundException('Không tìm thấy chi nhánh đang hoạt động');
  }

  private accountBalance(accounts: any[], balances: Map<string, number>, type: string, currency: string) {
    return accounts
      .filter((account) => account.account_type === type && account.currency_code === currency)
      .reduce((sum, account) => sum + (balances.get(account.id) ?? 0), 0);
  }

  private periodRange(period: MonitoringPeriod, anchorDate: Date) {
    const year = anchorDate.getUTCFullYear();
    const month = anchorDate.getUTCMonth();
    const day = anchorDate.getUTCDate();
    if (period === 'year') return { from: new Date(Date.UTC(year, 0, 1)), to: new Date(Date.UTC(year + 1, 0, 1)) };
    if (period === 'month') return { from: new Date(Date.UTC(year, month, 1)), to: new Date(Date.UTC(year, month + 1, 1)) };
    return { from: new Date(Date.UTC(year, month, day)), to: new Date(Date.UTC(year, month, day + 1)) };
  }

  private sourceOf(operationCode: string) {
    return operationCode === 'DOMESTIC_TRANSFER' ? 'DOMESTIC' : operationCode;
  }

  private transactionValue(transaction: any) {
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

  private trendBucket(period: MonitoringPeriod, createdAt: Date, businessDate: Date) {
    if (period === 'day') {
      const hour = new Intl.DateTimeFormat('en-GB', {
        hour: '2-digit',
        hour12: false,
        timeZone: 'Asia/Ho_Chi_Minh',
      }).format(createdAt);
      return { label: `${hour}:00`, sort: hour };
    }
    const isoDate = businessDate.toISOString();
    if (period === 'month') return { label: `${isoDate.slice(8, 10)}/${isoDate.slice(5, 7)}`, sort: isoDate.slice(0, 10) };
    return { label: `${isoDate.slice(5, 7)}/${isoDate.slice(0, 4)}`, sort: isoDate.slice(0, 7) };
  }
}
