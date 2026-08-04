// Prisma Bank Repository — số dư NH + ghi nhận tiền WU/MG về (khép vòng công nợ)
// Layer: Infrastructure

import { Injectable, BadRequestException, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma.service';
import { IBankRepository, ReceiveFromProviderInput } from '../../../domain/repositories/bank.repository';
import { BankAccount, BankMovement, CurrencyCode } from '../../../domain/entities/bank.entity';
import { toVietnamBusinessDate } from '../business-date';
import { allocateDebtSettlement } from './debt-settlement-allocation';

const INCREASE_TYPES = ['EXPECTED_DEBT', 'ACTUAL_DEBT'];

@Injectable()
export class PrismaBankRepository implements IBankRepository {
  constructor(private readonly prisma: PrismaService) {}

  async listAccounts(branchId?: string): Promise<BankAccount[]> {
    const rows = await this.prisma.bank_accounts.findMany({
      where: { status: 'ACTIVE', ...(branchId && { branch_id: branchId }) },
      include: { banks: true },
      orderBy: [{ bank_id: 'asc' }, { currency_code: 'asc' }],
    });
    return rows.map((r: any) => ({
      id: r.id,
      bankCode: r.banks.code,
      bankName: r.banks.name,
      branchId: r.branch_id,
      accountNo: r.account_no,
      accountName: r.account_name,
      currencyCode: r.currency_code as CurrencyCode,
      currentBalance: Number(r.current_balance),
    }));
  }

  async listMovements(bankAccountId?: string, branchId?: string): Promise<BankMovement[]> {
    const rows = await this.prisma.bank_balance_movements.findMany({
      where: { ...(bankAccountId && { bank_account_id: bankAccountId }), ...(branchId && { branch_id: branchId }) },
      orderBy: { occurred_at: 'desc' },
      take: 100,
    });
    return rows.map(toMovement);
  }

  async receiveFromProvider(input: ReceiveFromProviderInput): Promise<BankMovement> {
    const now = new Date();
    const businessDate = toVietnamBusinessDate(now);

    const movementId = await this.prisma.$transaction(async (tx) => {
      await this.lockBankAccount(tx, input.bankAccountId);
      await this.lockDebtAccount(tx, input.debtAccountId);
      const bankAcc = await tx.bank_accounts.findUnique({ where: { id: input.bankAccountId } });
      if (!bankAcc) throw new NotFoundException('Không tìm thấy tài khoản ngân hàng');
      const debtAcc = await tx.debt_accounts.findUnique({ where: { id: input.debtAccountId } });
      if (!debtAcc) throw new NotFoundException('Không tìm thấy sổ công nợ');

      if (bankAcc.currency_code !== debtAcc.currency_code) {
        throw new BadRequestException(
          `Loại tiền không khớp: NH ${bankAcc.currency_code} vs công nợ ${debtAcc.currency_code}`,
        );
      }

      // Kiểm tra số còn nợ
      const outstanding = await this.debtOutstanding(tx, input.debtAccountId);
      if (input.amount > outstanding) {
        throw new BadRequestException(
          `Số tiền (${input.amount}) vượt số còn nợ (${outstanding} ${debtAcc.currency_code})`,
        );
      }

      const before = Number(bankAcc.current_balance);
      const after = before + input.amount;

      // 1. Bút toán tăng số dư ngân hàng
      const movement = await tx.bank_balance_movements.create({
        data: {
          movement_no: `BM-${Date.now()}-${Math.floor(Math.random() * 1000)}`,
          bank_account_id: bankAcc.id,
          branch_id: bankAcc.branch_id,
          movement_type: 'DEPOSIT',
          business_date: businessDate,
          amount: input.amount,
          currency_code: bankAcc.currency_code,
          balance_before: before,
          balance_after: after,
          bank_reference: input.bankReference ?? null,
          description: input.description ?? `Tiền ${debtAcc.provider_code} về`,
          status: 'POSTED',
          posted_at: now,
          created_by_user_id: input.createdByUserId,
        },
      });

      // 2. Cập nhật số dư lưu trên tài khoản
      await tx.bank_accounts.update({
        where: { id: bankAcc.id },
        data: { current_balance: after, available_balance: after },
      });

      // 3. Trừ công nợ (SETTLEMENT)
      const settlement = await tx.debt_movements.create({
        data: {
          debt_account_id: debtAcc.id,
          branch_id: debtAcc.branch_id,
          movement_type: 'SETTLEMENT',
          source_type: 'BANK_MOVEMENT',
          source_id: movement.id,
          business_date: businessDate,
          amount: input.amount,
          currency_code: debtAcc.currency_code,
          status: 'POSTED',
          posted_at: now,
          description: `Tiền về NH ${bankAcc.account_no}`,
          created_by_user_id: input.createdByUserId,
        },
      });
      await allocateDebtSettlement(tx, debtAcc.id, settlement.id, input.amount);

      return movement.id;
    });

    const row = await this.prisma.bank_balance_movements.findUniqueOrThrow({ where: { id: movementId } });
    return toMovement(row);
  }

  private async debtOutstanding(tx: any, debtAccountId: string): Promise<number> {
    const grouped = await tx.debt_movements.groupBy({
      by: ['movement_type'],
      where: { debt_account_id: debtAccountId, status: 'POSTED' },
      _sum: { amount: true },
    });
    let debt = 0;
    let settled = 0;
    for (const g of grouped) {
      const s = Number(g._sum.amount ?? 0);
      if (INCREASE_TYPES.includes(g.movement_type)) debt += s;
      else if (g.movement_type === 'SETTLEMENT' || g.movement_type === 'REVERSAL') settled += s;
    }
    return debt - settled;
  }

  private async lockBankAccount(tx: any, bankAccountId: string) {
    await tx.$queryRaw`SELECT id FROM bank_accounts WHERE id = ${bankAccountId}::uuid FOR UPDATE`;
  }

  private async lockDebtAccount(tx: any, debtAccountId: string) {
    await tx.$queryRaw`SELECT id FROM debt_accounts WHERE id = ${debtAccountId}::uuid FOR UPDATE`;
  }
}

function toMovement(row: any): BankMovement {
  return {
    id: row.id,
    movementNo: row.movement_no,
    bankAccountId: row.bank_account_id,
    movementType: row.movement_type,
    businessDate: row.business_date,
    amount: Number(row.amount),
    currencyCode: row.currency_code as CurrencyCode,
    balanceBefore: Number(row.balance_before),
    balanceAfter: Number(row.balance_after),
    bankReference: row.bank_reference ?? null,
    description: row.description ?? null,
    createdAt: row.created_at,
  };
}
