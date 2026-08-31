// Prisma Debt Repository Implementation
// Layer: Infrastructure

import { BadRequestException, Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma.service';
import {
  IDebtRepository, SettleUsdCashDebtInput, ListDebtsFilter,
  SettleVndCashDebtInput, SettleDebtBatchInput, DebtBatchSettlementResult,
} from '../../../domain/repositories/debt.repository';
import {
  DebtAccount, DebtAccountSummary, DebtMovement, DebtMovementType,
  CurrencyCode, DebtStatus,
} from '../../../domain/entities/debt.entity';
import { toVietnamBusinessDate } from '../business-date';
import { allocateDebtSettlement } from './debt-settlement-allocation';
import { NotificationService } from '../../notifications/notification.service';
import { canonicalActiveFundAccount } from '../canonical-fund-account';

// movement_type nào là "tăng nợ"
const INCREASE_TYPES = ['EXPECTED_DEBT', 'ACTUAL_DEBT'];

@Injectable()
export class PrismaDebtRepository implements IDebtRepository {
  constructor(
    private readonly prisma: PrismaService,
    private readonly notifications: NotificationService,
  ) {}

  async settleUsdCash(input: SettleUsdCashDebtInput): Promise<DebtMovement> {
    const now = new Date();
    const businessDate = toVietnamBusinessDate(now);
    return this.prisma.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT id FROM debt_accounts WHERE id = ${input.debtAccountId}::uuid FOR UPDATE`;
      const debtAccount = await tx.debt_accounts.findUniqueOrThrow({ where: { id: input.debtAccountId } });
      this.assertReconciled(debtAccount);
      if (debtAccount.currency_code !== 'USD') {
        throw new BadRequestException('Form tiền mặt USD chỉ áp dụng cho công nợ USD');
      }

      const settlementAmount = Number((input.cashUsdAmount + input.oddUsdAmount).toFixed(2));
      const outstanding = await this.outstanding(tx, debtAccount.id);
      if (!sameMoney(settlementAmount, outstanding)) {
        throw new BadRequestException(
          `Công nợ phải được tất toán toàn bộ: cần đúng ${outstanding} USD`,
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
        return canonicalActiveFundAccount(tx, headOffice.id, receipt.currency, true);
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
      await tx.debt_accounts.update({
        where: { id: debtAccount.id },
        data: { lifecycle_status: 'SETTLED', settled_at: now, updated_at: now },
      });
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
      this.assertReconciled(debtAccount);
      if (debtAccount.currency_code !== 'VND') {
        throw new BadRequestException('Form tiền mặt VND chỉ áp dụng cho công nợ VND');
      }

      const outstanding = await this.outstanding(tx, debtAccount.id);
      if (!sameMoney(input.amount, outstanding)) {
        throw new BadRequestException(
          `Công nợ phải được tất toán toàn bộ: cần đúng ${outstanding} VND`,
        );
      }

      const headOffice = await tx.branch.findFirst({
        where: { type: 'HEAD_OFFICE', status: 'ACTIVE' },
        orderBy: { created_at: 'asc' },
        select: { id: true },
      });
      if (!headOffice) throw new BadRequestException('Chưa cấu hình chi nhánh Hội sở (HO)');

      const fundAccount = await canonicalActiveFundAccount(tx, headOffice.id, 'VND', true);
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
      await tx.debt_accounts.update({
        where: { id: debtAccount.id },
        data: { lifecycle_status: 'SETTLED', settled_at: now, updated_at: now },
      });
      await this.notifySettlement(
        tx, debtAccount, input.amount, outstanding, input.createdByUserId, 'Tiền mặt (Quỹ)',
      );
      return toMovement(settlement);
    });
  }

  async settleBatch(input: SettleDebtBatchInput): Promise<DebtBatchSettlementResult> {
    const now = new Date();
    const postingDate = toVietnamBusinessDate(now);
    const description = input.description?.trim() || 'Đã nhận thanh khoản từ Ngân hàng';
    const settlementNo = `DEBT-BATCH-${Date.now()}-${Math.floor(Math.random() * 1000)}`;

    return this.prisma.$transaction(async (tx) => {
      const accountIds = [...input.debtAccountIds].sort();
      for (const accountId of accountIds) {
        await tx.$queryRaw`SELECT id FROM debt_accounts WHERE id = ${accountId}::uuid FOR UPDATE`;
      }
      const accounts = await tx.debt_accounts.findMany({
        where: { id: { in: accountIds }, status: 'ACTIVE' },
        include: { transaction: { include: { wu_transaction_details: true } } },
        orderBy: { id: 'asc' },
      });
      if (accounts.length !== accountIds.length) {
        throw new BadRequestException('Một hoặc nhiều khoản công nợ không còn hoạt động');
      }
      const blocked = accounts.find((account) => account.lifecycle_status !== 'RECONCILED');
      if (blocked) {
        throw new BadRequestException('Chỉ công nợ đã đối chiếu RECONCILED mới được thanh toán');
      }
      const first = accounts[0];
      const sameGroup = accounts.every((account) => (
        account.provider_code === first.provider_code
        && account.currency_code === first.currency_code
        && account.business_date.getTime() === first.business_date.getTime()
      ));
      if (!sameGroup) {
        throw new BadRequestException('Chỉ được xử lý tổng các khoản cùng ngày, đối tác và loại tiền');
      }
      if (first.currency_code !== 'USD' && first.currency_code !== 'VND') {
        throw new BadRequestException('Xử lý tổng hiện chỉ áp dụng cho công nợ USD hoặc VND');
      }

      const outstandingByAccount = new Map<string, number>();
      for (const account of accounts) {
        const outstanding = Number((await this.outstanding(tx, account.id)).toFixed(2));
        if (outstanding > 0) outstandingByAccount.set(account.id, outstanding);
      }
      if (outstandingByAccount.size !== accounts.length) {
        throw new BadRequestException('Nhóm có khoản đã được tất toán. Vui lòng tải lại dữ liệu');
      }
      const totalOutstanding = Number(
        [...outstandingByAccount.values()].reduce((sum, amount) => sum + amount, 0).toFixed(2),
      );
      if (Math.abs(input.amount - totalOutstanding) >= 0.005) {
        throw new BadRequestException(
          `Tổng đối chiếu không khớp: yêu cầu ${input.amount}, hệ thống ${totalOutstanding} ${first.currency_code}`,
        );
      }

      let sourceType: 'BANK_MOVEMENT' | 'CASH_MOVEMENT';
      let sourceId: string;
      if (input.settlementSource === 'BANK') {
        if (!input.bankAccountId) throw new BadRequestException('Phải chọn tài khoản ngân hàng nhận tiền');
        const assignedBankIds = [...new Set(accounts
          .map((account: any) => account.transaction?.wu_transaction_details?.bank_account_id)
          .filter(Boolean))];
        if (accounts.some((account: any) => account.provider_code === 'WU'
          && !account.transaction?.wu_transaction_details?.bank_account_id)) {
          throw new BadRequestException('Có giao dịch WU chưa được gắn tài khoản ngân hàng thanh toán');
        }
        if (assignedBankIds.length > 1 || (assignedBankIds.length === 1 && assignedBankIds[0] !== input.bankAccountId)) {
          throw new BadRequestException('Các công nợ WU phải được thanh toán qua đúng ngân hàng đã chọn khi tạo giao dịch');
        }
        await tx.$queryRaw`SELECT id FROM bank_accounts WHERE id = ${input.bankAccountId}::uuid FOR UPDATE`;
        const bankAccount = await tx.bank_accounts.findFirst({
          where: { id: input.bankAccountId, status: 'ACTIVE' },
        });
        if (!bankAccount) throw new BadRequestException('Không tìm thấy tài khoản ngân hàng đang hoạt động');
        if (bankAccount.currency_code !== first.currency_code) {
          throw new BadRequestException(`Tài khoản ngân hàng không sử dụng ${first.currency_code}`);
        }
        const before = Number(bankAccount.current_balance);
        const after = before + totalOutstanding;
        const movement = await tx.bank_balance_movements.create({
          data: {
            movement_no: settlementNo,
            bank_account_id: bankAccount.id,
            branch_id: bankAccount.branch_id,
            movement_type: 'DEPOSIT',
            business_date: postingDate,
            amount: totalOutstanding,
            currency_code: first.currency_code,
            balance_before: before,
            balance_after: after,
            bank_reference: input.bankReference?.trim() || null,
            description,
            status: 'POSTED',
            posted_at: now,
            created_by_user_id: input.createdByUserId,
          },
        });
        await tx.bank_accounts.update({
          where: { id: bankAccount.id },
          data: { current_balance: after, available_balance: after },
        });
        sourceType = 'BANK_MOVEMENT';
        sourceId = movement.id;
      } else {
        const headOffice = await tx.branch.findFirst({
          where: { type: 'HEAD_OFFICE', status: 'ACTIVE' },
          orderBy: { created_at: 'asc' },
          select: { id: true },
        });
        if (!headOffice) throw new BadRequestException('Chưa cấu hình chi nhánh Hội sở (HO)');

        const receipts: Array<{ currency: 'USD' | 'VND'; amount: number; exchangeRate: number }> = [];
        if (first.currency_code === 'VND') {
          receipts.push({ currency: 'VND', amount: totalOutstanding, exchangeRate: 1 });
        } else {
          const rate = await tx.exchange_rates.findFirst({
            where: {
              rate_type: 'BANK_RATE', from_currency: 'USD', to_currency: 'VND', status: 'ACTIVE',
              effective_from: { lte: now }, OR: [{ effective_to: null }, { effective_to: { gt: now } }],
            },
            orderBy: { effective_from: 'desc' },
          });
          if (!rate) throw new BadRequestException('Chưa có tỷ giá ngân hàng USD/VND đang active');
          const bankRate = Number(rate.rate);
          const integerUsd = Math.trunc(totalOutstanding);
          const oddUsd = Number((totalOutstanding - integerUsd).toFixed(2));
          if (integerUsd > 0) receipts.push({ currency: 'USD', amount: integerUsd, exchangeRate: bankRate });
          if (oddUsd > 0) receipts.push({ currency: 'VND', amount: Math.round(oddUsd * bankRate), exchangeRate: 1 });
        }

        let firstMovementId: string | null = null;
        for (const [index, receipt] of receipts.entries()) {
          const fundAccount = await canonicalActiveFundAccount(tx, headOffice.id, receipt.currency, true);
          await tx.$queryRaw`SELECT id FROM fund_accounts WHERE id = ${fundAccount.id}::uuid FOR UPDATE`;
          const movement = await tx.cash_movements.create({
            data: {
              movement_no: `${settlementNo}-${index + 1}`,
              branch_id: headOffice.id,
              fund_account_id: fundAccount.id,
              movement_type: 'CASH_IN',
              business_date: postingDate,
              amount: receipt.amount,
              currency_code: receipt.currency,
              source_name: `${first.provider_code} - thanh khoản tổng`,
              description,
              status: 'POSTED',
              approved_by_user_id: input.createdByUserId,
              created_by_user_id: input.createdByUserId,
              posted_at: now,
            },
          });
          firstMovementId ??= movement.id;
          await tx.ledger_entries.create({
            data: {
              entry_no: `LE-${movement.movement_no}`,
              business_date: postingDate,
              branch_id: headOffice.id,
              source_type: 'CASH_MOVEMENT',
              source_id: movement.id,
              status: 'POSTED',
              posted_at: now,
              description,
              created_by_user_id: input.createdByUserId,
              approved_by_user_id: input.createdByUserId,
              ledger_lines: { create: [{
                fund_account_id: fundAccount.id,
                direction: 'DEBIT',
                amount: receipt.amount,
                currency_code: receipt.currency,
                exchange_rate: receipt.exchangeRate,
                base_amount_vnd: receipt.amount * receipt.exchangeRate,
              }] },
            },
          });
        }
        if (!firstMovementId) throw new BadRequestException('Không có số tiền để ghi nhận');
        sourceType = 'CASH_MOVEMENT';
        sourceId = firstMovementId;
      }

      for (const account of accounts) {
        const amount = outstandingByAccount.get(account.id)!;
        const settlement = await tx.debt_movements.create({
          data: {
            debt_account_id: account.id,
            branch_id: account.branch_id,
            movement_type: 'SETTLEMENT',
            source_type: sourceType,
            source_id: sourceId,
            business_date: postingDate,
            amount,
            currency_code: account.currency_code,
            description,
            status: 'POSTED',
            posted_at: now,
            created_by_user_id: input.createdByUserId,
          },
        });
        await allocateDebtSettlement(tx, account.id, settlement.id, amount);
      }
      await tx.debt_accounts.updateMany({
        where: { id: { in: accountIds }, lifecycle_status: 'RECONCILED' },
        data: { lifecycle_status: 'SETTLED', settled_at: now, updated_at: now },
      });

      await this.notifications.notifyUsers({
        title: 'Đã tất toán công nợ tổng',
        body: `${first.provider_code} ngày ${first.business_date.toISOString().slice(0, 10)}: ${accounts.length} chi nhánh, ${totalOutstanding.toLocaleString('en-US')} ${first.currency_code}.`,
        sourceType: 'DEBT_SETTLED',
        sourceId: first.id,
      }, {
        userIds: [input.createdByUserId],
        roles: ['ADMIN', 'MANAGER'],
        branchIds: accounts.map((account) => account.branch_id),
      }, tx);

      return {
        settlementNo,
        businessDate: first.business_date,
        providerCode: first.provider_code,
        currencyCode: first.currency_code as CurrencyCode,
        accountCount: accounts.length,
        totalAmount: totalOutstanding,
      };
    });
  }

  async findAccountById(id: string): Promise<DebtAccount | null> {
    const row = await this.prisma.debt_accounts.findUnique({ where: { id } });
    return row ? toAccount(row) : null;
  }

  async getAccountSummary(id: string): Promise<DebtAccountSummary | null> {
    const acc = await this.prisma.debt_accounts.findUnique({
      where: { id }, include: { transaction: { include: { wu_transaction_details: true } } },
    });
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
      include: { transaction: { include: { wu_transaction_details: true } } },
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

  private assertReconciled(account: { lifecycle_status: string }) {
    if (account.lifecycle_status !== 'RECONCILED') {
      throw new BadRequestException('Chỉ công nợ đã đối chiếu RECONCILED mới được thanh toán');
    }
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
      status: acc.lifecycle_status as DebtStatus,
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
    const currency = debtAccount.currency_code;
    const formatAmount = (value: number) => value.toLocaleString('vi-VN', {
      minimumFractionDigits: currency === 'VND' ? 0 : 2,
      maximumFractionDigits: currency === 'VND' ? 0 : 2,
    });
    await this.notifications.notifyUsers({
      title: 'Công nợ đã được tất toán',
      body: `${debtAccount.provider_code} ngày ${debtAccount.business_date.toISOString().slice(0, 10)}: nhận ${formatAmount(amount)} ${currency} qua ${sourceLabel}; còn lại ${formatAmount(Math.max(remaining, 0))} ${currency}.`,
      sourceType: 'DEBT_SETTLED',
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
    transactionId: row.transaction_id ?? null,
    reconciliationRunId: row.reconciliation_run_id ?? null,
    settlementBankAccountId: row.transaction?.wu_transaction_details?.bank_account_id ?? null,
    branchId: row.branch_id,
    providerCode: row.provider_code,
    currencyCode: row.currency_code as CurrencyCode,
    businessDate: row.business_date,
    name: row.name,
    status: row.lifecycle_status as DebtStatus,
    reconciledAt: row.reconciled_at ?? null,
    settledAt: row.settled_at ?? null,
    cancelledAt: row.cancelled_at ?? null,
  };
}

function sameMoney(left: number, right: number): boolean {
  return Math.abs(left - right) < 0.005;
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
