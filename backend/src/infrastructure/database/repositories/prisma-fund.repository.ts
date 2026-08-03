// Prisma Fund Repository — số dư quỹ (từ ledger) + điều chuyển vốn
// Layer: Infrastructure

import { Injectable, BadRequestException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma.service';
import {
  IFundRepository, CreateTransferInput, ListTransfersFilter,
} from '../../../domain/repositories/fund.repository';
import {
  FundTransfer, FundTransferStatus, FundAccountBalance, CurrencyCode, CentralFundSummary,
} from '../../../domain/entities/fund.entity';

const CURRENCY_NAMES: Partial<Record<CurrencyCode, string>> = {
  VND: 'Việt Nam đồng', USD: 'Đô la Mỹ', EUR: 'Euro', AUD: 'Đô la Úc', JPY: 'Yên Nhật',
  GBP: 'Bảng Anh', SGD: 'Đô la Singapore', THB: 'Baht Thái', CNY: 'Nhân dân tệ',
  HKD: 'Đô la Hong Kong', KRW: 'Won Hàn Quốc', CAD: 'Đô la Canada', CHF: 'Franc Thụy Sĩ',
  NZD: 'Đô la New Zealand', TWD: 'Đài tệ', MYR: 'Ringgit Malaysia', IDR: 'Rupiah Indonesia',
  PHP: 'Peso Philippines', LAK: 'Kip Lào', KHR: 'Riel Campuchia',
};

@Injectable()
export class PrismaFundRepository implements IFundRepository {
  constructor(private readonly prisma: PrismaService) {}

  async listBalances(branchId?: string): Promise<FundAccountBalance[]> {
    const accounts = await this.prisma.fund_accounts.findMany({
      where: { status: 'ACTIVE', ...(branchId && { branch_id: branchId }) },
      orderBy: [{ branch_id: 'asc' }, { code: 'asc' }],
    });
    const ids = accounts.map((a) => a.id);
    const balByAcc = await this.balancesFor(ids);
    return accounts.map((a) => ({
      id: a.id,
      branchId: a.branch_id,
      code: a.code,
      name: a.name,
      accountType: a.account_type,
      currencyCode: a.currency_code as CurrencyCode,
      balance: balByAcc.get(a.id) ?? 0,
    }));
  }

  async getBalance(fundAccountId: string): Promise<number> {
    const m = await this.balancesFor([fundAccountId]);
    return m.get(fundAccountId) ?? 0;
  }

  async getCentralSummary(): Promise<CentralFundSummary> {
    const now = new Date();
    const [accounts, bankAccounts, debtAccounts, rates, lastReconciliation] = await Promise.all([
      this.prisma.fund_accounts.findMany({
        where: { status: 'ACTIVE', account_type: { in: ['CASH', 'FUND_A'] } },
        include: { branches: { select: { type: true } } },
      }),
      this.prisma.bank_accounts.findMany({
        where: { status: 'ACTIVE' },
        select: { current_balance: true, currency_code: true },
      }),
      this.prisma.debt_accounts.findMany({
        where: { status: 'ACTIVE' },
        include: {
          debt_movements: {
            where: { status: 'POSTED' },
            select: { movement_type: true, amount: true },
          },
        },
      }),
      this.prisma.exchange_rates.findMany({
        where: {
          status: 'ACTIVE',
          to_currency: 'VND',
          effective_from: { lte: now },
          OR: [{ effective_to: null }, { effective_to: { gt: now } }],
          rate_type: { in: ['PAID_BUY', 'FX_BUY', 'BANK_RATE'] },
        },
        orderBy: { effective_from: 'desc' },
      }),
      this.prisma.reconciliation_runs.findFirst({
        where: { status: { in: ['MATCHED', 'APPROVED', 'POSTED'] } },
        orderBy: { updated_at: 'desc' },
        select: { updated_at: true },
      }),
    ]);

    const balances = await this.balancesFor(accounts.map((account) => account.id));
    const rateByCurrency = new Map<CurrencyCode, number>();
    let hasPaidBuyUsd = false;
    for (const rate of rates) {
      const currency = rate.from_currency as CurrencyCode;
      const isPreferredUsdRate = currency === 'USD' && rate.rate_type === 'PAID_BUY' && !hasPaidBuyUsd;
      if (!rateByCurrency.has(currency) || isPreferredUsdRate) {
        rateByCurrency.set(currency, Number(rate.rate));
      }
      if (isPreferredUsdRate) hasPaidBuyUsd = true;
    }
    rateByCurrency.set('VND', 1);
    const missingRates = new Set<CurrencyCode>();
    const conversionRate = (currency: CurrencyCode) => {
      const rate = rateByCurrency.get(currency) ?? 0;
      if (currency !== 'VND' && rate <= 0) missingRates.add(currency);
      return rate;
    };

    let vndCash = 0;
    let usdCash = 0;
    let branchFundValueVnd = 0;
    const fundAByCurrency = new Map<CurrencyCode, number>();
    for (const account of accounts) {
      const currency = account.currency_code as CurrencyCode;
      const balance = balances.get(account.id) ?? 0;
      const valueVnd = balance === 0 ? 0 : balance * conversionRate(currency);
      if (account.branches.type === 'BRANCH') {
        branchFundValueVnd += valueVnd;
        continue;
      }
      if (account.account_type === 'CASH' && currency === 'VND') vndCash += balance;
      else if (account.account_type === 'CASH' && currency === 'USD') usdCash += balance;
      else if (account.account_type === 'FUND_A') {
        fundAByCurrency.set(currency, (fundAByCurrency.get(currency) ?? 0) + balance);
      }
    }

    const fundA = Array.from(fundAByCurrency.entries())
      .filter(([, amount]) => amount !== 0)
      .map(([currency, amount]) => {
        const buyRate = conversionRate(currency);
        return {
          currency,
          name: CURRENCY_NAMES[currency] ?? currency,
          amount,
          buyRate,
          vndValue: amount * buyRate,
        };
      })
      .sort((a, b) => a.currency.localeCompare(b.currency));
    const fundAValueVnd = fundA.reduce((sum, item) => sum + item.vndValue, 0);
    const paidBuyRate = conversionRate('USD');
    const usdCashValueVnd = usdCash * paidBuyRate;
    const centralCashValueVnd = vndCash + usdCashValueVnd + fundAValueVnd;
    const bankValueVnd = bankAccounts.reduce((sum, account) => {
      const currency = account.currency_code as CurrencyCode;
      const balance = Number(account.current_balance);
      return sum + (balance === 0 ? 0 : balance * conversionRate(currency));
    }, 0);

    let debtVnd = 0;
    let debtUsd = 0;
    let debtValueVnd = 0;
    for (const account of debtAccounts) {
      const currency = account.currency_code as CurrencyCode;
      const outstanding = account.debt_movements.reduce((sum, movement) => {
        const amount = Number(movement.amount);
        if (movement.movement_type === 'EXPECTED_DEBT' || movement.movement_type === 'ACTUAL_DEBT') return sum + amount;
        if (movement.movement_type === 'SETTLEMENT') return sum - amount;
        return sum;
      }, 0);
      if (currency === 'VND') debtVnd += outstanding;
      if (currency === 'USD') debtUsd += outstanding;
      if (outstanding !== 0) debtValueVnd += outstanding * conversionRate(currency);
    }

    return {
      calculatedAt: now,
      lastReconciledAt: lastReconciliation?.updated_at ?? null,
      paidBuyRate,
      vndCash,
      usdCash,
      usdCashValueVnd,
      fundA,
      fundAValueVnd,
      centralCashValueVnd,
      bankValueVnd,
      debtVnd,
      debtUsd,
      debtValueVnd,
      branchFundValueVnd,
      totalCompanyFundVnd: centralCashValueVnd + bankValueVnd + branchFundValueVnd + debtValueVnd,
      missingRateCurrencies: Array.from(missingRates).sort(),
    };
  }

  async findHeadOfficeBranchId(): Promise<string | null> {
    const branch = await this.prisma.branch.findFirst({
      where: { type: 'HEAD_OFFICE', status: 'ACTIVE' },
      select: { id: true },
      orderBy: { created_at: 'asc' },
    });
    return branch?.id ?? null;
  }

  async findTransferAccount(branchId: string, currency: CurrencyCode) {
    const accounts = await this.prisma.fund_accounts.findMany({
      where: {
        branch_id: branchId,
        currency_code: currency,
        account_type: { in: ['CASH', 'FUND_A'] },
        status: 'ACTIVE',
      },
      select: { id: true, account_type: true },
    });
    return accounts.find((account) => account.account_type === 'CASH') ?? accounts[0] ?? null;
  }

  async createTransfer(input: CreateTransferInput): Promise<FundTransfer> {
    if (input.sourceBranchId === input.destinationBranchId) {
      throw new BadRequestException('Chi nhánh gửi và nhận phải khác nhau');
    }
    const currencies = input.items.map((item) => item.currencyCode);
    if (new Set(currencies).size !== currencies.length) {
      throw new BadRequestException('Mỗi loại tiền chỉ được xuất hiện một lần trong phiếu tiếp quỹ');
    }

    const resolvedItems = [];
    for (const item of input.items) {
      const source = await this.findTransferAccount(input.sourceBranchId, item.currencyCode);
      const destination = await this.findTransferAccount(input.destinationBranchId, item.currencyCode);
      if (!source || !destination) {
        throw new BadRequestException(`Thiếu sổ quỹ ${item.currencyCode} ở đơn vị gửi hoặc nhận`);
      }
      const sourceBalance = await this.getBalance(source.id);
      if (item.amount > sourceBalance) {
        throw new BadRequestException(`Số dư ${item.currencyCode} không đủ (còn ${sourceBalance})`);
      }
      resolvedItems.push({
        source_account_id: source.id,
        destination_account_id: destination.id,
        currency_code: item.currencyCode,
        amount: item.amount,
      });
    }

    const row = await this.prisma.fund_transfers.create({
      data: {
        transfer_no: `FT-${Date.now()}-${Math.floor(Math.random() * 1000)}`,
        source_branch_id: input.sourceBranchId,
        destination_branch_id: input.destinationBranchId,
        status: 'PENDING_APPROVAL',
        created_by_user_id: input.createdByUserId,
        fund_transfer_items: { create: resolvedItems },
      },
      include: { fund_transfer_items: true },
    });
    return toTransfer(row);
  }

  async findTransferById(id: string): Promise<FundTransfer | null> {
    const row = await this.prisma.fund_transfers.findUnique({
      where: { id },
      include: { fund_transfer_items: true },
    });
    return row ? toTransfer(row) : null;
  }

  async listTransfers(filter?: ListTransfersFilter): Promise<FundTransfer[]> {
    const rows = await this.prisma.fund_transfers.findMany({
      where: {
        ...(filter?.status && { status: filter.status as any }),
        ...(filter?.branchId && {
          OR: [
            { source_branch_id: filter.branchId },
            { destination_branch_id: filter.branchId },
          ],
        }),
      },
      orderBy: { created_at: 'desc' },
      include: { fund_transfer_items: true },
    });
    return rows.map(toTransfer);
  }

  async confirmTransfer(id: string, confirmedByUserId: string): Promise<FundTransfer> {
    const t = await this.prisma.fund_transfers.findUniqueOrThrow({
      where: { id },
      include: { fund_transfer_items: true },
    });
    if (t.status !== 'PENDING_APPROVAL') {
      throw new BadRequestException(`Chỉ xác nhận được phiếu đang chờ (hiện tại: ${t.status})`);
    }
    const now = new Date();

    const updated = await this.prisma.$transaction(async (tx) => {
      const sourceAccountIds = [...new Set(t.fund_transfer_items.map((item) => item.source_account_id))].sort();
      for (const sourceAccountId of sourceAccountIds) {
        await this.lockFundAccount(tx, sourceAccountId);
      }

      const ledgerLines: Prisma.ledger_linesUncheckedCreateWithoutLedger_entriesInput[] = [];
      for (const item of t.fund_transfer_items) {
        const amount = Number(item.amount);
        const sourceBalance = await this.balance(tx, item.source_account_id);
        if (amount > sourceBalance) {
          throw new BadRequestException(
            `Số dư không đủ tại thời điểm xác nhận (còn ${sourceBalance} ${item.currency_code})`,
          );
        }
        const rate = await this.activeConversionRate(tx, item.currency_code as CurrencyCode);
        ledgerLines.push(
          {
            fund_account_id: item.source_account_id,
            direction: 'CREDIT',
            amount,
            currency_code: item.currency_code,
            exchange_rate: rate,
            base_amount_vnd: amount * rate,
          },
          {
            fund_account_id: item.destination_account_id,
            direction: 'DEBIT',
            amount,
            currency_code: item.currency_code,
            exchange_rate: rate,
            base_amount_vnd: amount * rate,
          },
        );
      }

      await tx.ledger_entries.create({
        data: {
          entry_no: `FT-${t.transfer_no}`,
          business_date: now,
          branch_id: t.source_branch_id,
          source_type: 'FUND_TRANSFER',
          source_id: t.id,
          status: 'POSTED',
          posted_at: now,
          description: `Tiếp quỹ ${t.fund_transfer_items.map((item) => `${Number(item.amount)} ${item.currency_code}`).join(', ')}`,
          created_by_user_id: confirmedByUserId,
          ledger_lines: { create: ledgerLines },
        },
      });
      return tx.fund_transfers.update({
        where: { id },
        data: {
          status: 'CONFIRMED',
          confirmed_by_user_id: confirmedByUserId,
          confirmed_at: now,
          posted_at: now,
        },
        include: { fund_transfer_items: true },
      });
    });
    return toTransfer(updated);
  }

  async rejectTransfer(id: string, userId: string): Promise<FundTransfer> {
    const t = await this.prisma.fund_transfers.findUniqueOrThrow({ where: { id } });
    if (t.status !== 'PENDING_APPROVAL') {
      throw new BadRequestException(`Chỉ từ chối được phiếu đang chờ (hiện tại: ${t.status})`);
    }
    const row = await this.prisma.fund_transfers.update({
      where: { id },
      data: { status: 'REJECTED', confirmed_by_user_id: userId, confirmed_at: new Date() },
      include: { fund_transfer_items: true },
    });
    return toTransfer(row);
  }

  private async lockFundAccount(db: any, fundAccountId: string) {
    await db.$queryRaw`SELECT id FROM fund_accounts WHERE id = ${fundAccountId}::uuid FOR UPDATE`;
  }

  private async balance(db: any, fundAccountId: string): Promise<number> {
    const lines = await db.ledger_lines.findMany({
      where: { fund_account_id: fundAccountId, ledger_entries: { status: 'POSTED' } },
      select: { direction: true, amount: true },
    });
    return lines.reduce((sum: number, line: any) => sum + (line.direction === 'DEBIT' ? Number(line.amount) : -Number(line.amount)), 0);
  }

  private async activeConversionRate(db: any, currency: CurrencyCode): Promise<number> {
    if (currency === 'VND') return 1;
    const fxRate = await db.exchange_rates.findFirst({
      where: {
        status: 'ACTIVE',
        rate_type: 'FX_BUY',
        from_currency: currency,
        to_currency: 'VND',
      },
      orderBy: { effective_from: 'desc' },
      select: { rate: true },
    });
    if (fxRate) return Number(fxRate.rate);

    if (currency === 'USD') {
      const paidRate = await db.exchange_rates.findFirst({
        where: {
          status: 'ACTIVE',
          rate_type: { in: ['PAID_BUY', 'BANK_RATE'] },
          from_currency: 'USD',
          to_currency: 'VND',
        },
        orderBy: { effective_from: 'desc' },
        select: { rate: true },
      });
      if (paidRate) return Number(paidRate.rate);
    }

    throw new BadRequestException(`Chưa có tỷ giá quy đổi ACTIVE cho ${currency}/VND`);
  }

  // ── helper: tính số dư nhiều account từ ledger_lines POSTED ──
  private async balancesFor(accountIds: string[]): Promise<Map<string, number>> {
    const map = new Map<string, number>();
    if (accountIds.length === 0) return map;
    const lines = await this.prisma.ledger_lines.findMany({
      where: { fund_account_id: { in: accountIds }, ledger_entries: { status: 'POSTED' } },
      select: { fund_account_id: true, direction: true, amount: true },
    });
    for (const l of lines) {
      const cur = map.get(l.fund_account_id) ?? 0;
      const amt = Number(l.amount);
      map.set(l.fund_account_id, cur + (l.direction === 'DEBIT' ? amt : -amt));
    }
    return map;
  }
}

function toTransfer(row: any): FundTransfer {
  return {
    id: row.id,
    transferNo: row.transfer_no,
    sourceBranchId: row.source_branch_id,
    destinationBranchId: row.destination_branch_id,
    items: (row.fund_transfer_items ?? []).map((item: any) => ({
      id: item.id,
      sourceAccountId: item.source_account_id,
      destinationAccountId: item.destination_account_id,
      currencyCode: item.currency_code as CurrencyCode,
      amount: Number(item.amount),
    })),
    status: row.status as FundTransferStatus,
    createdByUserId: row.created_by_user_id,
    confirmedByUserId: row.confirmed_by_user_id ?? null,
    createdAt: row.created_at,
    confirmedAt: row.confirmed_at ?? null,
  };
}
