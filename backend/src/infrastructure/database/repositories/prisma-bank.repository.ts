// Prisma Bank Repository — số dư NH + ghi nhận tiền WU/MG về (khép vòng công nợ)
// Layer: Infrastructure

import { Injectable, BadRequestException, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma.service';
import {
  IBankRepository, ReceiveFromProviderInput, CreateBankAccountInput, CreateBankMovementInput,
} from '../../../domain/repositories/bank.repository';
import { Bank, BankAccount, BankMovement, CurrencyCode, isBankInflow } from '../../../domain/entities/bank.entity';
import { toVietnamBusinessDate } from '../business-date';
import { allocateDebtSettlement } from './debt-settlement-allocation';
import { NotificationService } from '../../notifications/notification.service';

const INCREASE_TYPES = ['EXPECTED_DEBT', 'ACTUAL_DEBT'];

@Injectable()
export class PrismaBankRepository implements IBankRepository {
  constructor(
    private readonly prisma: PrismaService,
    private readonly notifications: NotificationService,
  ) {}

  async listBanks(): Promise<Bank[]> {
    const rows = await this.prisma.banks.findMany({ where: { status: 'ACTIVE' }, orderBy: { code: 'asc' } });
    return rows.map((r) => ({ id: r.id, code: r.code, name: r.name }));
  }

  async listAccounts(branchId?: string, includeInactive = false): Promise<BankAccount[]> {
    const rows = await this.prisma.bank_accounts.findMany({
      where: { ...(includeInactive ? {} : { status: 'ACTIVE' }), ...(branchId && { branch_id: branchId }) },
      include: { banks: true, branches: { select: { code: true, name: true } } },
      orderBy: [{ branches: { code: 'asc' } }, { bank_id: 'asc' }, { currency_code: 'asc' }],
    });
    return rows.map(toAccount);
  }

  async findAccount(id: string): Promise<BankAccount | null> {
    const row = await this.prisma.bank_accounts.findUnique({
      where: { id },
      include: { banks: true, branches: { select: { code: true, name: true } } },
    });
    return row ? toAccount(row) : null;
  }

  // Tạo tài khoản NH cho 1 chi nhánh (hoặc Hội sở). Bank chưa có -> tạo mới theo code.
  // Số dư đầu kỳ > 0 được ghi thành 1 biến động DEPOSIT để mọi số dư đều truy vết được.
  async createAccount(input: CreateBankAccountInput): Promise<BankAccount> {
    const now = new Date();
    const id = await this.prisma.$transaction(async (tx) => {
      const branch = await tx.branch.findUnique({ where: { id: input.branchId }, select: { id: true } });
      if (!branch) throw new NotFoundException('Không tìm thấy chi nhánh');

      let bank = await tx.banks.findUnique({ where: { code: input.bankCode } });
      if (!bank) {
        bank = await tx.banks.create({ data: { code: input.bankCode, name: input.bankName?.trim() || input.bankCode } });
      } else if (bank.status !== 'ACTIVE') {
        bank = await tx.banks.update({ where: { id: bank.id }, data: { status: 'ACTIVE' } });
      }

      const dup = await tx.bank_accounts.findUnique({
        where: { bank_id_account_no: { bank_id: bank.id, account_no: input.accountNo } },
      });
      if (dup) throw new BadRequestException(`Số tài khoản ${input.accountNo} tại ${bank.code} đã tồn tại`);

      const opening = Number(input.openingBalance ?? 0);
      const account = await tx.bank_accounts.create({
        data: {
          branch_id: input.branchId,
          bank_id: bank.id,
          account_no: input.accountNo,
          account_name: input.accountName,
          currency_code: input.currencyCode as any,
          opening_balance: opening,
          current_balance: opening,
          available_balance: opening,
          status: 'ACTIVE',
        },
      });
      if (opening > 0) {
        await tx.bank_balance_movements.create({
          data: {
            movement_no: newMovementNo(),
            bank_account_id: account.id,
            branch_id: input.branchId,
            movement_type: 'DEPOSIT',
            business_date: toVietnamBusinessDate(now),
            amount: opening,
            currency_code: input.currencyCode as any,
            balance_before: 0,
            balance_after: opening,
            description: 'Số dư đầu kỳ khi khai báo tài khoản',
            status: 'POSTED',
            posted_at: now,
            created_by_user_id: input.createdByUserId,
          },
        });
      }
      return account.id;
    });
    return (await this.findAccount(id))!;
  }

  async deactivateAccount(id: string): Promise<BankAccount> {
    await this.prisma.bank_accounts.update({ where: { id }, data: { status: 'INACTIVE', updated_at: new Date() } });
    return (await this.findAccount(id))!;
  }

  // Nộp/rút/chuyển khoản thủ công trên 1 tài khoản NH.
  async createMovement(input: CreateBankMovementInput): Promise<BankMovement> {
    const now = new Date();
    const businessDate = input.businessDate ?? toVietnamBusinessDate(now);
    const inflow = isBankInflow(input.movementType);

    const movementId = await this.prisma.$transaction(async (tx) => {
      await this.lockBankAccount(tx, input.bankAccountId);
      const account = await tx.bank_accounts.findUnique({ where: { id: input.bankAccountId } });
      if (!account) throw new NotFoundException('Không tìm thấy tài khoản ngân hàng');
      if (account.status !== 'ACTIVE') throw new BadRequestException('Tài khoản ngân hàng đã ngưng hoạt động');

      const before = Number(account.current_balance);
      const after = inflow ? before + input.amount : before - input.amount;
      if (after < 0) {
        throw new BadRequestException(
          `Số dư tài khoản ${account.account_no} không đủ (còn ${before} ${account.currency_code})`,
        );
      }
      const description = [input.description, input.counterparty ? `Đối tác: ${input.counterparty}` : null]
        .filter(Boolean).join(' · ') || defaultDescription(input.movementType);

      const movement = await tx.bank_balance_movements.create({
        data: {
          movement_no: newMovementNo(),
          bank_account_id: account.id,
          branch_id: account.branch_id,
          movement_type: input.movementType,
          business_date: businessDate,
          amount: input.amount,
          currency_code: account.currency_code,
          balance_before: before,
          balance_after: after,
          bank_reference: input.bankReference ?? null,
          description,
          status: 'POSTED',
          posted_at: now,
          created_by_user_id: input.createdByUserId,
        },
      });
      await tx.bank_accounts.update({
        where: { id: account.id },
        data: { current_balance: after, available_balance: after, updated_at: now },
      });
      return movement.id;
    });

    const row = await this.prisma.bank_balance_movements.findUniqueOrThrow({ where: { id: movementId } });
    return toMovement(row);
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
          movement_no: newMovementNo(),
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
      const remaining = Number((outstanding - input.amount).toFixed(2));
      const settled = remaining <= 0;
      const fractionDigits = debtAcc.currency_code === 'VND' ? 0 : 2;
      const formatAmount = (value: number) => value.toLocaleString('vi-VN', {
        minimumFractionDigits: fractionDigits,
        maximumFractionDigits: fractionDigits,
      });
      await this.notifications.notifyUsers({
        title: settled ? 'Công nợ đã được tất toán' : 'Công nợ đã được xử lý một phần',
        body: `${debtAcc.provider_code} ngày ${debtAcc.business_date.toISOString().slice(0, 10)}: nhận ${formatAmount(input.amount)} ${debtAcc.currency_code} qua ngân hàng ${bankAcc.account_no}; còn lại ${formatAmount(Math.max(remaining, 0))} ${debtAcc.currency_code}.`,
        sourceType: settled ? 'DEBT_SETTLED' : 'DEBT_PARTIALLY_SETTLED',
        sourceId: debtAcc.id,
      }, {
        userIds: [input.createdByUserId],
        roles: ['ADMIN', 'MANAGER'],
        branchIds: [debtAcc.branch_id],
      }, tx);

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

  // Ghi nhận tạm ứng CK hằng ngày tại chi nhánh
  async recordAdvanceCk(input: import('../../../domain/repositories/bank.repository').RecordAdvanceCkInput): Promise<BankMovement> {
    const now = new Date();
    const businessDate = toVietnamBusinessDate(now);
    return this.prisma.$transaction(async (tx) => {
      await this.lockBankAccount(tx, input.bankAccountId);
      const bankAcc = await tx.bank_accounts.findUnique({ where: { id: input.bankAccountId } });
      if (!bankAcc) throw new NotFoundException('Không tìm thấy tài khoản ngân hàng');
      const before = Number(bankAcc.current_balance);
      const after = before - input.amount; // CK ra → số dư giảm
      const movement = await tx.bank_balance_movements.create({
        data: {
          movement_no: `ADV-CK-${Date.now()}-${Math.floor(Math.random() * 1000)}`,
          bank_account_id: input.bankAccountId,
          branch_id: input.branchId,
          movement_type: 'ADVANCE_CK' as any,
          business_date: businessDate,
          amount: input.amount,
          currency_code: bankAcc.currency_code,
          balance_before: before,
          balance_after: after,
          description: input.description,
          status: 'POSTED',
          posted_at: now,
          created_by_user_id: input.createdByUserId,
        },
      });
      await tx.bank_accounts.update({
        where: { id: input.bankAccountId },
        data: { current_balance: after, available_balance: after },
      });
      return toMovement(movement);
    });
  }

  // Hoàn lại tạm ứng CK cuối ngày
  async settleAdvanceCk(input: import('../../../domain/repositories/bank.repository').SettleAdvanceCkInput): Promise<BankMovement> {
    const now = new Date();
    const businessDate = toVietnamBusinessDate(now);
    return this.prisma.$transaction(async (tx) => {
      const advance = await tx.bank_balance_movements.findUnique({ where: { id: input.advanceMovementId } });
      if (!advance || advance.movement_type !== 'ADVANCE_CK') {
        throw new BadRequestException('Không tìm thấy phiếu tạm ứng CK hợp lệ');
      }
      if (advance.bank_account_id !== input.bankAccountId) {
        throw new BadRequestException('Phiếu tạm ứng không thuộc tài khoản ngân hàng này');
      }
      const already = await tx.bank_balance_movements.findFirst({
        where: { movement_type: 'ADVANCE_SETTLE', bank_reference: input.advanceMovementId },
        select: { movement_no: true },
      });
      if (already) throw new BadRequestException(`Phiếu tạm ứng ${advance.movement_no} đã được hoàn (${already.movement_no})`);
      await this.lockBankAccount(tx, input.bankAccountId);
      const bankAcc = await tx.bank_accounts.findUnique({ where: { id: input.bankAccountId } });
      if (!bankAcc) throw new NotFoundException('Không tìm thấy tài khoản ngân hàng');
      const before = Number(bankAcc.current_balance);
      const after = before + Number(advance.amount); // hoàn lại → số dư tăng
      const movement = await tx.bank_balance_movements.create({
        data: {
          movement_no: `ADV-SETTLE-${Date.now()}-${Math.floor(Math.random() * 1000)}`,
          bank_account_id: input.bankAccountId,
          branch_id: advance.branch_id,
          movement_type: 'ADVANCE_SETTLE' as any,
          business_date: businessDate,
          amount: Number(advance.amount),
          currency_code: bankAcc.currency_code,
          balance_before: before,
          balance_after: after,
          description: input.note ?? `Hoàn lại CK ${advance.movement_no}`,
          bank_reference: input.advanceMovementId, // liên kết tới phiếu gốc
          status: 'POSTED',
          posted_at: now,
          created_by_user_id: input.settledByUserId,
        },
      });
      await tx.bank_accounts.update({
        where: { id: input.bankAccountId },
        data: { current_balance: after, available_balance: after },
      });
      return toMovement(movement);
    });
  }

  // Liệt kê tạm ứng CK theo filter.
  //   status ADVANCE_CK = phiếu ứng CHƯA hoàn; SETTLED = phiếu ứng ĐÃ hoàn; bỏ trống = tất cả phiếu ứng (kèm cờ settled).
  // Phiếu hoàn (ADVANCE_SETTLE) tham chiếu phiếu ứng qua bank_reference = id phiếu ứng.
  async listAdvances(filter?: import('../../../domain/repositories/bank.repository').ListAdvancesFilter): Promise<BankMovement[]> {
    const scope = {
      ...(filter?.bankAccountId && { bank_account_id: filter.bankAccountId }),
      ...(filter?.branchId && { branch_id: filter.branchId }),
      ...(filter?.businessDate && { business_date: filter.businessDate }),
    };
    const [advances, settles] = await Promise.all([
      this.prisma.bank_balance_movements.findMany({
        where: { movement_type: 'ADVANCE_CK', ...scope },
        orderBy: { occurred_at: 'desc' },
        take: 200,
      }),
      this.prisma.bank_balance_movements.findMany({
        where: { movement_type: 'ADVANCE_SETTLE', bank_reference: { not: null } },
        select: { id: true, bank_reference: true },
      }),
    ]);
    const settledBy = new Map(settles.map((s) => [s.bank_reference as string, s.id]));
    return advances
      .map((row) => ({ ...toMovement(row), settled: settledBy.has(row.id), settledMovementId: settledBy.get(row.id) ?? null }))
      .filter((m) => (filter?.status === 'ADVANCE_CK' ? !m.settled : filter?.status === 'SETTLED' ? m.settled : true));
  }


  private async lockDebtAccount(tx: any, debtAccountId: string) {
    await tx.$queryRaw`SELECT id FROM debt_accounts WHERE id = ${debtAccountId}::uuid FOR UPDATE`;
  }
}

function newMovementNo(): string {
  return `BM-${Date.now()}-${Math.floor(Math.random() * 100000)}`;
}

function defaultDescription(type: string): string {
  switch (type) {
    case 'DEPOSIT': return 'Nộp tiền vào tài khoản';
    case 'WITHDRAW': return 'Rút tiền khỏi tài khoản';
    case 'TRANSFER_IN': return 'Nhận chuyển khoản';
    case 'TRANSFER_OUT': return 'Chuyển khoản đi';
    default: return type;
  }
}

function toAccount(r: any): BankAccount {
  return {
    id: r.id,
    bankId: r.bank_id,
    bankCode: r.banks.code,
    bankName: r.banks.name,
    branchId: r.branch_id,
    branchCode: r.branches?.code,
    branchName: r.branches?.name,
    accountNo: r.account_no,
    accountName: r.account_name,
    currencyCode: r.currency_code as CurrencyCode,
    currentBalance: Number(r.current_balance),
    status: r.status === 'ACTIVE' ? 'ACTIVE' : 'INACTIVE',
  };
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
    createdByUserId: row.created_by_user_id,
    createdAt: row.created_at,
  };
}
