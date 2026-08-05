// Prisma Debt Repository Implementation
// Layer: Infrastructure

import { BadRequestException, Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma.service';
import {
  IDebtRepository, RecordDebtInput, SettleUsdCashDebtInput, ListDebtsFilter,
  SettleVndCashDebtInput,
} from '../../../domain/repositories/debt.repository';
import {
  DebtAccount, DebtAccountSummary, DebtMovement, DebtMovementType,
  CurrencyCode, computeDebtStatus,
} from '../../../domain/entities/debt.entity';
import { toVietnamBusinessDate } from '../business-date';
import { allocateDebtSettlement } from './debt-settlement-allocation';
import { NotificationService } from '../../notifications/notification.service';

// movement_type nào là "tăng nợ"
const INCREASE_TYPES = ['EXPECTED_DEBT', 'ACTUAL_DEBT'];

@Injectable()
export class PrismaDebtRepository implements IDebtRepository {
  constructor(
    private readonly prisma: PrismaService,
    private readonly notifications: NotificationService,
  ) {}

  async recordDebt(input: RecordDebtInput): Promise<DebtMovement> {
    const businessDate = toVietnamBusinessDate(input.businessDate ?? new Date());
    const now = new Date();
    const row = await this.prisma.$transaction(async (tx) => {
      const account = await this.ensureAccount(
        tx, input.branchId, input.providerCode, input.currencyCode, businessDate,
      );
      return tx.debt_movements.create({
        data: {
          debt_account_id: account.id,
          branch_id: input.branchId,
          movement_type: 'EXPECTED_DEBT',
          source_type: (input.sourceType as any) ?? null,
          source_id: input.sourceId ?? null,
          business_date: businessDate,
          amount: input.amount,
          currency_code: input.currencyCode,
          description: input.description ?? null,
          status: 'POSTED',
          posted_at: now,
          created_by_user_id: input.createdByUserId,
        },
      });
    });
    return toMovement(row);
  }

  async settleUsdCash(input: SettleUsdCashDebtInput): Promise<DebtMovement> {
    const now = new Date();
    const businessDate = toVietnamBusinessDate(now);
    return this.prisma.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT id FROM debt_accounts WHERE id = ${input.debtAccountId}::uuid FOR UPDATE`;
      const debtAccount = await tx.debt_accounts.findUniqueOrThrow({ where: { id: input.debtAccountId } });
      if (debtAccount.currency_code !== 'USD') {
        throw new BadRequestException('Form tiền mặt USD chỉ áp dụng cho công nợ USD');
      }

      const settlementAmount = Number((input.cashUsdAmount + input.oddUsdAmount).toFixed(2));
      const outstanding = await this.outstanding(tx, debtAccount.id);
      if (settlementAmount > outstanding) {
        throw new BadRequestException(
          `Số tiền xử lý (${settlementAmount}) vượt số còn nợ (${outstanding} USD)`,
        );
      }

      const bankRate = await tx.exchange_rates.findFirst({
        where: {
          rate_type: 'BANK_RATE',
          from_currency: 'USD',
          to_currency: 'VND',
          status: 'ACTIVE',
          effective_from: { lte: now },
          OR: [{ effective_to: null }, { effective_to: { gt: now } }],
        },
        orderBy: { effective_from: 'desc' },
      });
      if (!bankRate) throw new BadRequestException('Chưa có tỷ giá ngân hàng USD/VND đang active');
      const rate = Number(bankRate.rate);
      const oddVndAmount = Math.round(input.oddUsdAmount * rate);

      const headOffice = await tx.branch.findFirst({
        where: { type: 'HEAD_OFFICE', status: 'ACTIVE' },
        orderBy: { created_at: 'asc' },
        select: { id: true },
      });
      if (!headOffice) throw new BadRequestException('Chưa cấu hình chi nhánh Hội sở (HO)');

      const receipts = [
        ...(input.cashUsdAmount > 0 ? [{ currency: 'USD' as const, amount: input.cashUsdAmount, exchangeRate: rate }] : []),
        ...(oddVndAmount > 0 ? [{ currency: 'VND' as const, amount: oddVndAmount, exchangeRate: 1 }] : []),
      ];
      const accountRows = await Promise.all(receipts.map(async (receipt) => {
        return tx.fund_accounts.upsert({
          where: {
            branch_id_code: { branch_id: headOffice.id, code: `CASH_${receipt.currency}` },
          },
          update: {},
          create: {
            branch_id: headOffice.id,
            code: `CASH_${receipt.currency}`,
            name: `Quỹ tiền mặt ${receipt.currency}`,
            account_type: 'CASH',
            currency_code: receipt.currency,
          },
        });
      }));
      for (const account of [...accountRows].sort((left, right) => left.id.localeCompare(right.id))) {
        await tx.$queryRaw`SELECT id FROM fund_accounts WHERE id = ${account.id}::uuid FOR UPDATE`;
      }

      let firstCashMovementId: string | null = null;
      for (const [index, receipt] of receipts.entries()) {
        const account = accountRows[index];
        const movement = await tx.cash_movements.create({
          data: {
            movement_no: `DEBT-CASH-${Date.now()}-${index}-${Math.floor(Math.random() * 1000)}`,
            branch_id: headOffice.id,
            fund_account_id: account.id,
            movement_type: 'CASH_IN',
            business_date: businessDate,
            amount: receipt.amount,
            currency_code: receipt.currency,
            source_name: `${debtAccount.provider_code} - công nợ ${debtAccount.business_date.toISOString().slice(0, 10)}`,
            description: input.description ?? 'Thu tiền giải quyết công nợ USD',
            status: 'POSTED',
            approved_by_user_id: input.createdByUserId,
            created_by_user_id: input.createdByUserId,
            posted_at: now,
          },
        });
        firstCashMovementId ??= movement.id;
        await tx.ledger_entries.create({
          data: {
            entry_no: `LE-${movement.movement_no}`,
            business_date: businessDate,
            branch_id: headOffice.id,
            source_type: 'CASH_MOVEMENT',
            source_id: movement.id,
            status: 'POSTED',
            posted_at: now,
            description: input.description ?? 'Thu tiền giải quyết công nợ USD',
            created_by_user_id: input.createdByUserId,
            approved_by_user_id: input.createdByUserId,
            ledger_lines: {
              create: [{
                fund_account_id: account.id,
                direction: 'DEBIT',
                amount: receipt.amount,
                currency_code: receipt.currency,
                exchange_rate: receipt.exchangeRate,
                base_amount_vnd: receipt.amount * receipt.exchangeRate,
              }],
            },
          },
        });
      }

      const settlement = await tx.debt_movements.create({
        data: {
          debt_account_id: debtAccount.id,
          branch_id: debtAccount.branch_id,
          movement_type: 'SETTLEMENT',
          source_type: 'CASH_MOVEMENT',
          source_id: firstCashMovementId,
          business_date: businessDate,
          amount: settlementAmount,
          currency_code: 'USD',
          description: `${input.description ?? 'Thu tiền mặt USD'}; phần lẻ ${input.oddUsdAmount} USD = ${oddVndAmount} VND @ ${rate}`,
          status: 'POSTED',
          posted_at: now,
          created_by_user_id: input.createdByUserId,
        },
      });
      await allocateDebtSettlement(tx, debtAccount.id, settlement.id, settlementAmount);
      await this.notifySettlement(
        tx, debtAccount, settlementAmount, outstanding, input.createdByUserId, 'Tiền mặt (Quỹ)',
      );
      return toMovement(settlement);
    });
  }

  async settleVndCash(input: SettleVndCashDebtInput): Promise<DebtMovement> {
    const now = new Date();
    const businessDate = toVietnamBusinessDate(now);
    return this.prisma.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT id FROM debt_accounts WHERE id = ${input.debtAccountId}::uuid FOR UPDATE`;
      const debtAccount = await tx.debt_accounts.findUniqueOrThrow({ where: { id: input.debtAccountId } });
      if (debtAccount.currency_code !== 'VND') {
        throw new BadRequestException('Form tiền mặt VND chỉ áp dụng cho công nợ VND');
      }

      const outstanding = await this.outstanding(tx, debtAccount.id);
      if (input.amount > outstanding) {
        throw new BadRequestException(
          `Số tiền xử lý (${input.amount}) vượt số còn nợ (${outstanding} VND)`,
        );
      }

      const headOffice = await tx.branch.findFirst({
        where: { type: 'HEAD_OFFICE', status: 'ACTIVE' },
        orderBy: { created_at: 'asc' },
        select: { id: true },
      });
      if (!headOffice) throw new BadRequestException('Chưa cấu hình chi nhánh Hội sở (HO)');

      const fundAccount = await tx.fund_accounts.upsert({
        where: { branch_id_code: { branch_id: headOffice.id, code: 'CASH_VND' } },
        update: {},
        create: {
          branch_id: headOffice.id,
          code: 'CASH_VND',
          name: 'Quỹ tiền mặt VND',
          account_type: 'CASH',
          currency_code: 'VND',
        },
      });
      await tx.$queryRaw`SELECT id FROM fund_accounts WHERE id = ${fundAccount.id}::uuid FOR UPDATE`;

      const movementNo = `DEBT-CASH-${Date.now()}-${Math.floor(Math.random() * 1000)}`;
      const cashMovement = await tx.cash_movements.create({
        data: {
          movement_no: movementNo,
          branch_id: headOffice.id,
          fund_account_id: fundAccount.id,
          movement_type: 'CASH_IN',
          business_date: businessDate,
          amount: input.amount,
          currency_code: 'VND',
          source_name: `${debtAccount.provider_code} - công nợ ${debtAccount.business_date.toISOString().slice(0, 10)}`,
          description: input.description ?? 'Thu tiền mặt giải quyết công nợ VND',
          status: 'POSTED',
          approved_by_user_id: input.createdByUserId,
          created_by_user_id: input.createdByUserId,
          posted_at: now,
        },
      });
      await tx.ledger_entries.create({
        data: {
          entry_no: `LE-${movementNo}`,
          business_date: businessDate,
          branch_id: headOffice.id,
          source_type: 'CASH_MOVEMENT',
          source_id: cashMovement.id,
          status: 'POSTED',
          posted_at: now,
          description: input.description ?? 'Thu tiền mặt giải quyết công nợ VND',
          created_by_user_id: input.createdByUserId,
          approved_by_user_id: input.createdByUserId,
          ledger_lines: {
            create: [{
              fund_account_id: fundAccount.id,
              direction: 'DEBIT',
              amount: input.amount,
              currency_code: 'VND',
              exchange_rate: 1,
              base_amount_vnd: input.amount,
            }],
          },
        },
      });

      const settlement = await tx.debt_movements.create({
        data: {
          debt_account_id: debtAccount.id,
          branch_id: debtAccount.branch_id,
          movement_type: 'SETTLEMENT',
          source_type: 'CASH_MOVEMENT',
          source_id: cashMovement.id,
          business_date: businessDate,
          amount: input.amount,
          currency_code: 'VND',
          description: input.description ?? 'Thu tiền mặt giải quyết công nợ VND',
          status: 'POSTED',
          posted_at: now,
          created_by_user_id: input.createdByUserId,
        },
      });
      await allocateDebtSettlement(tx, debtAccount.id, settlement.id, input.amount);
      await this.notifySettlement(
        tx, debtAccount, input.amount, outstanding, input.createdByUserId, 'Tiền mặt (Quỹ)',
      );
      return toMovement(settlement);
    });
  }

  async findAccountById(id: string): Promise<DebtAccount | null> {
    const row = await this.prisma.debt_accounts.findUnique({ where: { id } });
    return row ? toAccount(row) : null;
  }

  async getAccountSummary(id: string): Promise<DebtAccountSummary | null> {
    const acc = await this.prisma.debt_accounts.findUnique({ where: { id } });
    if (!acc) return null;
    return this.buildSummary(acc);
  }

  async listAccountSummaries(filter?: ListDebtsFilter): Promise<DebtAccountSummary[]> {
    const accounts = await this.prisma.debt_accounts.findMany({
      where: {
        ...(filter?.branchId && { branch_id: filter.branchId }),
        ...(filter?.providerCode && { provider_code: filter.providerCode }),
        ...(filter?.currencyCode && { currency_code: filter.currencyCode }),
        ...(filter?.businessDate && { business_date: toVietnamBusinessDate(filter.businessDate) }),
        ...(!filter?.businessDate && (filter?.dateFrom || filter?.dateTo) && {
          business_date: {
            ...(filter.dateFrom && { gte: toVietnamBusinessDate(filter.dateFrom) }),
            ...(filter.dateTo && { lte: toVietnamBusinessDate(filter.dateTo) }),
          },
        }),
      },
      orderBy: [{ business_date: 'desc' }, { created_at: 'desc' }],
    });
    return Promise.all(accounts.map((a) => this.buildSummary(a)));
  }

  async listMovements(accountId: string): Promise<DebtMovement[]> {
    const rows = await this.prisma.debt_movements.findMany({
      where: { debt_account_id: accountId },
      orderBy: { effective_at: 'desc' },
    });
    return rows.map(toMovement);
  }

  // ── helpers ──────────────────────────────────────────────

  private async ensureAccount(
    db: any, branchId: string, providerCode: string, currencyCode: CurrencyCode, businessDate: Date,
  ) {
    return db.debt_accounts.upsert({
      where: {
        branch_id_provider_code_currency_code_business_date: {
          branch_id: branchId,
          provider_code: providerCode,
          currency_code: currencyCode,
          business_date: businessDate,
        },
      },
      update: {},
      create: {
        branch_id: branchId,
        provider_code: providerCode,
        currency_code: currencyCode,
        business_date: businessDate,
        name: `Công nợ ${providerCode} ${currencyCode} ngày ${businessDate.toISOString().slice(0, 10)}`,
      },
    });
  }

  private async buildSummary(acc: any): Promise<DebtAccountSummary> {
    const grouped = await this.prisma.debt_movements.groupBy({
      by: ['movement_type'],
      where: { debt_account_id: acc.id, status: 'POSTED' },
      _sum: { amount: true },
    });
    let totalDebt = 0;
    let totalSettled = 0;
    for (const g of grouped) {
      const sum = Number(g._sum.amount ?? 0);
      if (INCREASE_TYPES.includes(g.movement_type)) totalDebt += sum;
      else if (g.movement_type === 'SETTLEMENT' || g.movement_type === 'REVERSAL') totalSettled += sum;
    }
    const outstanding = totalDebt - totalSettled;
    return {
      ...toAccount(acc),
      totalDebt,
      totalSettled,
      outstanding,
      status: computeDebtStatus(totalDebt, totalSettled),
    };
  }

  private async outstanding(tx: any, debtAccountId: string): Promise<number> {
    const grouped = await tx.debt_movements.groupBy({
      by: ['movement_type'],
      where: { debt_account_id: debtAccountId, status: 'POSTED' },
      _sum: { amount: true },
    });
    return grouped.reduce((balance: number, group: any) => {
      const amount = Number(group._sum.amount ?? 0);
      if (INCREASE_TYPES.includes(group.movement_type)) return balance + amount;
      if (group.movement_type === 'SETTLEMENT' || group.movement_type === 'REVERSAL') return balance - amount;
      return balance;
    }, 0);
  }

  private async notifySettlement(
    tx: any,
    debtAccount: any,
    amount: number,
    outstandingBefore: number,
    actorUserId: string,
    sourceLabel: string,
  ) {
    const remaining = Number((outstandingBefore - amount).toFixed(2));
    const settled = remaining <= 0;
    const currency = debtAccount.currency_code;
    const formatAmount = (value: number) => value.toLocaleString('vi-VN', {
      minimumFractionDigits: currency === 'VND' ? 0 : 2,
      maximumFractionDigits: currency === 'VND' ? 0 : 2,
    });
    await this.notifications.notifyUsers({
      title: settled ? 'Công nợ đã được tất toán' : 'Công nợ đã được xử lý một phần',
      body: `${debtAccount.provider_code} ngày ${debtAccount.business_date.toISOString().slice(0, 10)}: nhận ${formatAmount(amount)} ${currency} qua ${sourceLabel}; còn lại ${formatAmount(Math.max(remaining, 0))} ${currency}.`,
      sourceType: settled ? 'DEBT_SETTLED' : 'DEBT_PARTIALLY_SETTLED',
      sourceId: debtAccount.id,
    }, {
      userIds: [actorUserId],
      roles: ['ADMIN', 'MANAGER'],
      branchIds: [debtAccount.branch_id],
    }, tx);
  }
}

function toAccount(row: any): DebtAccount {
  return {
    id: row.id,
    branchId: row.branch_id,
    providerCode: row.provider_code,
    currencyCode: row.currency_code as CurrencyCode,
    businessDate: row.business_date,
    name: row.name,
  };
}

function toMovement(row: any): DebtMovement {
  return {
    id: row.id,
    debtAccountId: row.debt_account_id,
    branchId: row.branch_id,
    movementType: row.movement_type as DebtMovementType,
    sourceType: row.source_type ?? null,
    sourceId: row.source_id ?? null,
    businessDate: row.business_date,
    effectiveAt: row.effective_at,
    amount: Number(row.amount),
    currencyCode: row.currency_code as CurrencyCode,
    description: row.description ?? null,
    createdByUserId: row.created_by_user_id,
    createdAt: row.created_at,
  };
}
