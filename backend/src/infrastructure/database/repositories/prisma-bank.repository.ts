// Prisma Bank Repository — số dư NH + ghi nhận tiền WU/MG về (khép vòng công nợ)
// Layer: Infrastructure

import { Injectable, BadRequestException, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma.service';
import {
  IBankRepository, ReceiveFromProviderInput, CreateBankAccountInput, CreateBankMovementInput,
  InternalBankTransferInput,
} from '../../../domain/repositories/bank.repository';
import {
  Bank, BankAccount, BankMovement, CurrencyCode, InternalBankTransferResult, isBankInflow,
} from '../../../domain/entities/bank.entity';
import { toVietnamBusinessDate } from '../business-date';
import { canonicalActiveFundAccount } from '../canonical-fund-account';
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
      // Không chọn chi nhánh -> tài khoản dùng chung, gắn Hội sở
      const branch = input.branchId
        ? await tx.branch.findUnique({ where: { id: input.branchId }, select: { id: true } })
        : await tx.branch.findFirst({ where: { type: 'HEAD_OFFICE' }, select: { id: true } });
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
          branch_id: branch.id,
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
            branch_id: branch.id,
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

  // Nạp/rút tiền mặt cập nhật đồng thời quỹ; nhận/chuyển khoản chỉ cập nhật ngân hàng.
  async createMovement(input: CreateBankMovementInput): Promise<BankMovement> {
    const now = new Date();
    const businessDate = input.businessDate ?? toVietnamBusinessDate(now);
    const inflow = isBankInflow(input.movementType);
    const movesCash = input.movementType === 'DEPOSIT' || input.movementType === 'WITHDRAW';

    const movementId = await this.prisma.$transaction(async (tx) => {
      const accountSnapshot = await tx.bank_accounts.findUnique({ where: { id: input.bankAccountId } });
      if (!accountSnapshot) throw new NotFoundException('Không tìm thấy tài khoản ngân hàng');

      const cashAccount = movesCash
        ? await tx.fund_accounts.findFirst({
            where: {
              branch_id: accountSnapshot.branch_id,
              currency_code: accountSnapshot.currency_code,
              account_type: 'CASH',
              status: 'ACTIVE',
            },
            select: { id: true },
          })
        : null;
      if (movesCash && !cashAccount) {
        throw new BadRequestException(`Chi nhánh chưa có quỹ tiền mặt ${accountSnapshot.currency_code}`);
      }

      // Cùng thứ tự khóa với các nghiệp vụ quỹ khác: quỹ trước, ngân hàng sau.
      if (cashAccount) {
        await tx.$queryRaw`SELECT id FROM fund_accounts WHERE id = ${cashAccount.id}::uuid FOR UPDATE`;
      }
      await this.lockBankAccount(tx, input.bankAccountId);
      const account = await tx.bank_accounts.findUnique({ where: { id: input.bankAccountId } });
      if (!account) throw new NotFoundException('Không tìm thấy tài khoản ngân hàng');
      if (account.status !== 'ACTIVE') throw new BadRequestException('Tài khoản ngân hàng đã ngưng hoạt động');

      if (input.movementType === 'DEPOSIT' && cashAccount) {
        const cashBalance = await this.cashBalance(tx, cashAccount.id);
        if (input.amount > cashBalance) {
          throw new BadRequestException(
            `Quỹ tiền mặt ${account.currency_code} không đủ (còn ${cashBalance}, cần nạp ${input.amount})`,
          );
        }
      }

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

      if (cashAccount) {
        const exchangeRate = await this.cashExchangeRate(tx, account.currency_code);
        await tx.ledger_entries.create({
          data: {
            entry_no: `BANK-CASH-${movement.id}`,
            business_date: businessDate,
            branch_id: account.branch_id,
            source_type: 'BANK_MOVEMENT',
            source_id: movement.id,
            status: 'POSTED',
            posted_at: now,
            description: input.movementType === 'DEPOSIT'
              ? `Nạp tiền mặt vào ${account.account_no}`
              : `Rút tiền mặt từ ${account.account_no}`,
            created_by_user_id: input.createdByUserId,
            ledger_lines: {
              create: [{
                fund_account_id: cashAccount.id,
                direction: input.movementType === 'DEPOSIT' ? 'CREDIT' : 'DEBIT',
                amount: input.amount,
                currency_code: account.currency_code,
                exchange_rate: exchangeRate,
                base_amount_vnd: input.amount * exchangeRate,
              }],
            },
          },
        });
      }
      return movement.id;
    });

    const row = await this.prisma.bank_balance_movements.findUniqueOrThrow({ where: { id: movementId } });
    return toMovement(row);
  }

  async transferInternal(input: InternalBankTransferInput): Promise<InternalBankTransferResult> {
    if (input.fromBankAccountId === input.toBankAccountId) {
      throw new BadRequestException('Tài khoản nguồn và tài khoản đích phải khác nhau');
    }
    const now = new Date();
    const businessDate = input.businessDate ?? toVietnamBusinessDate(now);
    const transferReference = `CKNB-${Date.now()}-${Math.floor(Math.random() * 100000)}`;

    return this.prisma.$transaction(async (tx) => {
      const accountIds = [input.fromBankAccountId, input.toBankAccountId].sort();
      for (const accountId of accountIds) await this.lockBankAccount(tx, accountId);

      const accounts = await tx.bank_accounts.findMany({ where: { id: { in: accountIds } } });
      const fromAccount = accounts.find((account) => account.id === input.fromBankAccountId);
      const toAccount = accounts.find((account) => account.id === input.toBankAccountId);
      if (!fromAccount || !toAccount) throw new NotFoundException('Không tìm thấy tài khoản nguồn hoặc tài khoản đích');
      if (fromAccount.status !== 'ACTIVE' || toAccount.status !== 'ACTIVE') {
        throw new BadRequestException('Chỉ được chuyển giữa các tài khoản đang hoạt động');
      }
      if (fromAccount.currency_code !== toAccount.currency_code) {
        throw new BadRequestException('Tài khoản nguồn và tài khoản đích phải cùng loại tiền');
      }

      const amount = Number(input.amount);
      const fromBefore = Number(fromAccount.current_balance);
      const toBefore = Number(toAccount.current_balance);
      if (amount > fromBefore) {
        throw new BadRequestException(
          `Tài khoản nguồn không đủ số dư (còn ${fromBefore} ${fromAccount.currency_code})`,
        );
      }
      const fromAfter = fromBefore - amount;
      const toAfter = toBefore + amount;
      const description = [
        input.description?.trim() || 'Chuyển khoản nội bộ',
        input.bankReference?.trim() ? `Ref NH: ${input.bankReference.trim()}` : null,
      ].filter(Boolean).join(' · ');

      const [fromMovement, destinationMovement] = await Promise.all([
        tx.bank_balance_movements.create({
          data: {
            movement_no: `${transferReference}-OUT`,
            bank_account_id: fromAccount.id,
            branch_id: fromAccount.branch_id,
            movement_type: 'TRANSFER_OUT',
            business_date: businessDate,
            amount,
            currency_code: fromAccount.currency_code,
            balance_before: fromBefore,
            balance_after: fromAfter,
            bank_reference: transferReference,
            description: `${description} → ${toAccount.account_no}`,
            status: 'POSTED',
            posted_at: now,
            created_by_user_id: input.createdByUserId,
          },
        }),
        tx.bank_balance_movements.create({
          data: {
            movement_no: `${transferReference}-IN`,
            bank_account_id: toAccount.id,
            branch_id: toAccount.branch_id,
            movement_type: 'TRANSFER_IN',
            business_date: businessDate,
            amount,
            currency_code: toAccount.currency_code,
            balance_before: toBefore,
            balance_after: toAfter,
            bank_reference: transferReference,
            description: `${description} ← ${fromAccount.account_no}`,
            status: 'POSTED',
            posted_at: now,
            created_by_user_id: input.createdByUserId,
          },
        }),
      ]);

      await Promise.all([
        tx.bank_accounts.update({
          where: { id: fromAccount.id },
          data: { current_balance: fromAfter, available_balance: fromAfter, updated_at: now },
        }),
        tx.bank_accounts.update({
          where: { id: toAccount.id },
          data: { current_balance: toAfter, available_balance: toAfter, updated_at: now },
        }),
      ]);

      await this.notifications.notifyUsers({
        title: 'Chuyển khoản nội bộ thành công',
        body: `${amount.toLocaleString('en-US')} ${fromAccount.currency_code}: ${fromAccount.account_no} → ${toAccount.account_no}.`,
        sourceType: 'BANK_INTERNAL_TRANSFER',
        sourceId: fromMovement.id,
      }, {
        userIds: [input.createdByUserId],
        roles: ['ADMIN', 'MANAGER'],
        branchIds: [...new Set([fromAccount.branch_id, toAccount.branch_id])],
      }, tx);

      return {
        transferReference,
        fromMovement: toMovement(fromMovement),
        toMovement: toMovement(destinationMovement),
      };
    });
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
      const debtAcc = await tx.debt_accounts.findUnique({
        where: { id: input.debtAccountId },
        include: { transaction: { include: { wu_transaction_details: true } } },
      });
      if (!debtAcc) throw new NotFoundException('Không tìm thấy sổ công nợ');

      if (bankAcc.currency_code !== debtAcc.currency_code) {
        throw new BadRequestException(
          `Loại tiền không khớp: NH ${bankAcc.currency_code} vs công nợ ${debtAcc.currency_code}`,
        );
      }
      if (debtAcc.lifecycle_status !== 'RECONCILED') {
        throw new BadRequestException('Chỉ công nợ đã đối chiếu RECONCILED mới được thanh toán');
      }
      const assignedBankId = debtAcc.transaction?.wu_transaction_details?.bank_account_id;
      if (debtAcc.provider_code === 'WU' && assignedBankId !== input.bankAccountId) {
        throw new BadRequestException('Công nợ WU phải được thanh toán qua đúng ngân hàng đã chọn khi tạo giao dịch');
      }

      // Kiểm tra số còn nợ
      const outstanding = await this.debtOutstanding(tx, input.debtAccountId);
      if (Math.abs(input.amount - outstanding) >= 0.005) {
        throw new BadRequestException(
          `Công nợ phải được tất toán toàn bộ: cần đúng ${outstanding} ${debtAcc.currency_code}`,
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
      await tx.debt_accounts.update({
        where: { id: debtAcc.id },
        data: { lifecycle_status: 'SETTLED', settled_at: now, updated_at: now },
      });
      const remaining = 0;
      const fractionDigits = debtAcc.currency_code === 'VND' ? 0 : 2;
      const formatAmount = (value: number) => value.toLocaleString('vi-VN', {
        minimumFractionDigits: fractionDigits,
        maximumFractionDigits: fractionDigits,
      });
      await this.notifications.notifyUsers({
        title: 'Công nợ đã được tất toán',
        body: `${debtAcc.provider_code} ngày ${debtAcc.business_date.toISOString().slice(0, 10)}: nhận ${formatAmount(input.amount)} ${debtAcc.currency_code} qua ngân hàng ${bankAcc.account_no}; còn lại ${formatAmount(Math.max(remaining, 0))} ${debtAcc.currency_code}.`,
        sourceType: 'DEBT_SETTLED',
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

  // Hoàn lại tạm ứng CK cuối ngày — PHẢI có tài khoản đối ứng (không tự sinh tiền):
  //   BRANCH_CASH : chi quỹ tiền mặt chi nhánh đã ứng (ghi cash_movements + ledger CREDIT) -> TK ngân hàng tăng
  //   BANK_ACCOUNT: chuyển khoản nội bộ — TK nguồn giảm (TRANSFER_OUT) -> TK đã ứng tăng
  async settleAdvanceCk(input: import('../../../domain/repositories/bank.repository').SettleAdvanceCkInput): Promise<BankMovement> {
    const now = new Date();
    const businessDate = toVietnamBusinessDate(now);
    return this.prisma.$transaction(async (tx) => {
      const advance = await tx.bank_balance_movements.findUnique({ where: { id: input.advanceMovementId } });
      if (!advance || advance.movement_type !== 'ADVANCE_CK') {
        throw new BadRequestException('Không tìm thấy phiếu tạm ứng CK hợp lệ');
      }
      const already = await tx.bank_balance_movements.findFirst({
        where: { movement_type: 'ADVANCE_SETTLE', bank_reference: input.advanceMovementId },
        select: { movement_no: true },
      });
      if (already) throw new BadRequestException(`Phiếu tạm ứng ${advance.movement_no} đã được hoàn (${already.movement_no})`);

      const amount = Number(advance.amount);
      const targetId = advance.bank_account_id;
      await this.lockBankAccount(tx, targetId);
      const target = await tx.bank_accounts.findUniqueOrThrow({ where: { id: targetId } });

      let sourceLabel: string;
      if (input.source === 'BANK_ACCOUNT') {
        if (!input.sourceBankAccountId) throw new BadRequestException('Thiếu tài khoản ngân hàng nguồn');
        if (input.sourceBankAccountId === targetId) {
          throw new BadRequestException('Tài khoản nguồn phải khác tài khoản đã ứng');
        }
        await this.lockBankAccount(tx, input.sourceBankAccountId);
        const source = await tx.bank_accounts.findUnique({ where: { id: input.sourceBankAccountId } });
        if (!source || source.status !== 'ACTIVE') throw new NotFoundException('Không tìm thấy tài khoản nguồn đang hoạt động');
        if (source.currency_code !== target.currency_code) {
          throw new BadRequestException(`Tài khoản nguồn dùng ${source.currency_code}, không khớp ${target.currency_code}`);
        }
        const srcBefore = Number(source.current_balance);
        if (amount > srcBefore) {
          throw new BadRequestException(`Số dư tài khoản nguồn ${source.account_no} không đủ (còn ${srcBefore} ${source.currency_code})`);
        }
        await tx.bank_balance_movements.create({
          data: {
            movement_no: `ADV-SETTLE-SRC-${Date.now()}-${Math.floor(Math.random() * 1000)}`,
            bank_account_id: source.id,
            branch_id: source.branch_id,
            movement_type: 'TRANSFER_OUT',
            business_date: businessDate,
            amount,
            currency_code: source.currency_code,
            balance_before: srcBefore,
            balance_after: srcBefore - amount,
            bank_reference: `SRC-${input.advanceMovementId}`,
            description: `Hoàn tạm ứng CK ${advance.movement_no}${input.note ? ` - ${input.note}` : ''}`,
            status: 'POSTED',
            posted_at: now,
            created_by_user_id: input.settledByUserId,
          },
        });
        await tx.bank_accounts.update({
          where: { id: source.id },
          data: { current_balance: srcBefore - amount, available_balance: srcBefore - amount },
        });
        sourceLabel = `từ TK ${source.account_no}`;
      } else {
        // BRANCH_CASH: chi quỹ tiền mặt của chi nhánh đã ứng (tiền mặt đã thu của khách)
        const cashAccount = await canonicalActiveFundAccount(tx, advance.branch_id, target.currency_code as CurrencyCode, false);
        if (!cashAccount) {
          throw new BadRequestException(`Chi nhánh chưa có sổ tiền mặt ${target.currency_code} để hoàn ứng`);
        }
        const lines = await tx.ledger_lines.findMany({
          where: { fund_account_id: cashAccount.id, ledger_entries: { status: 'POSTED' } },
          select: { direction: true, amount: true },
        });
        const cashBalance = lines.reduce((sum: number, l: any) => sum + (l.direction === 'DEBIT' ? Number(l.amount) : -Number(l.amount)), 0);
        if (amount > cashBalance) {
          throw new BadRequestException(`Quỹ tiền mặt chi nhánh không đủ (còn ${cashBalance} ${target.currency_code})`);
        }
        const rate = await this.activeCashRate(tx, String(target.currency_code));
        const movementNo = `ADV-SETTLE-CASH-${Date.now()}-${Math.floor(Math.random() * 1000)}`;
        const cashMovement = await tx.cash_movements.create({
          data: {
            movement_no: movementNo,
            branch_id: advance.branch_id,
            fund_account_id: cashAccount.id,
            movement_type: 'CASH_OUT',
            business_date: businessDate,
            amount,
            currency_code: target.currency_code,
            source_name: 'Hoàn tạm ứng CK',
            description: `Hoàn tạm ứng CK ${advance.movement_no}${input.note ? ` - ${input.note}` : ''}`,
            status: 'POSTED',
            approved_by_user_id: input.settledByUserId,
            created_by_user_id: input.settledByUserId,
            posted_at: now,
          },
        });
        await tx.ledger_entries.create({
          data: {
            entry_no: `LE-${movementNo}`,
            business_date: businessDate,
            branch_id: advance.branch_id,
            source_type: 'CASH_MOVEMENT',
            source_id: cashMovement.id,
            status: 'POSTED',
            posted_at: now,
            description: `Chi tiền mặt hoàn tạm ứng CK ${advance.movement_no}${input.note ? ` - ${input.note}` : ''}`,
            created_by_user_id: input.settledByUserId,
            approved_by_user_id: input.settledByUserId,
            ledger_lines: {
              create: [{
                fund_account_id: cashAccount.id,
                direction: 'CREDIT',
                amount,
                currency_code: target.currency_code,
                exchange_rate: rate,
                base_amount_vnd: amount * rate,
              }],
            },
          },
        });
        sourceLabel = 'từ quỹ tiền mặt chi nhánh';
      }

      const before = Number(target.current_balance);
      const after = before + amount;
      const movement = await tx.bank_balance_movements.create({
        data: {
          movement_no: `ADV-SETTLE-${Date.now()}-${Math.floor(Math.random() * 1000)}`,
          bank_account_id: targetId,
          branch_id: advance.branch_id,
          movement_type: 'ADVANCE_SETTLE' as any,
          business_date: businessDate,
          amount,
          currency_code: target.currency_code,
          balance_before: before,
          balance_after: after,
          bank_reference: input.advanceMovementId, // liên kết tới phiếu ứng gốc
          description: `Hoàn tạm ứng ${advance.movement_no} ${sourceLabel}${input.note ? ` - ${input.note}` : ''}`,
          status: 'POSTED',
          posted_at: now,
          created_by_user_id: input.settledByUserId,
        },
      });
      await tx.bank_accounts.update({
        where: { id: targetId },
        data: { current_balance: after, available_balance: after },
      });
      return toMovement(movement);
    });
  }

  // Tỷ giá quy đổi VND cho bút toán tiền mặt: VND = 1, ngoại tệ lấy FX_BUY active (fallback 1)
  private async activeCashRate(db: any, currency: string): Promise<number> {
    if (currency === 'VND') return 1;
    const fx = await db.exchange_rates.findFirst({
      where: {
        status: 'ACTIVE', rate_type: 'FX_BUY', provider: 'INTERNAL',
        from_currency: currency, to_currency: 'VND',
        effective_from: { lte: new Date() },
        OR: [{ effective_to: null }, { effective_to: { gt: new Date() } }],
      },
      orderBy: { effective_from: 'desc' },
      select: { rate: true },
    });
    if (fx) return Number(fx.rate);
    const paid = await db.exchange_rates.findFirst({
      where: {
        status: 'ACTIVE', rate_type: 'PAID_BUY',
        from_currency: currency, to_currency: 'VND',
        effective_from: { lte: new Date() },
        OR: [{ effective_to: null }, { effective_to: { gt: new Date() } }],
      },
      orderBy: { effective_from: 'desc' },
      select: { rate: true },
    });
    return paid ? Number(paid.rate) : 1;
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
        select: { id: true, bank_reference: true, description: true, posted_at: true, created_at: true },
      }),
    ]);
    const settledBy = new Map(settles.map((s) => [s.bank_reference as string, s]));
    return advances
      .map((row) => {
        const st = settledBy.get(row.id);
        return {
          ...toMovement(row),
          settled: !!st,
          settledMovementId: st?.id ?? null,
          settledAt: st ? (st.posted_at ?? st.created_at) : null,
          settledDescription: st?.description ?? null,
        };
      })
      .filter((m) => (filter?.status === 'ADVANCE_CK' ? !m.settled : filter?.status === 'SETTLED' ? m.settled : true));
  }


  private async lockDebtAccount(tx: any, debtAccountId: string) {
    await tx.$queryRaw`SELECT id FROM debt_accounts WHERE id = ${debtAccountId}::uuid FOR UPDATE`;
  }

  private async cashBalance(tx: any, fundAccountId: string): Promise<number> {
    const lines = await tx.ledger_lines.findMany({
      where: { fund_account_id: fundAccountId, ledger_entries: { status: 'POSTED' } },
      select: { direction: true, amount: true },
    });
    return lines.reduce(
      (sum: number, line: any) => sum + (line.direction === 'DEBIT' ? Number(line.amount) : -Number(line.amount)),
      0,
    );
  }

  private async cashExchangeRate(tx: any, currencyCode: string): Promise<number> {
    if (currencyCode === 'VND') return 1;
    const activeRate = await tx.exchange_rates.findFirst({
      where: {
        from_currency: currencyCode,
        to_currency: 'VND',
        rate_type: 'FX_BUY',
        status: 'ACTIVE',
        effective_from: { lte: new Date() },
      },
      orderBy: { effective_from: 'desc' },
      select: { rate: true },
    });
    if (!activeRate) {
      throw new BadRequestException(`Chưa có tỷ giá mua ${currencyCode} ACTIVE để ghi nhận quỹ tiền mặt`);
    }
    return Number(activeRate.rate);
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
