import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma.service';
import { domesticTransferPosting } from '../../../domain/entities/domestic-transfer.entity';
import type { DomesticTransferTransaction } from '../../../domain/entities/domestic-transfer.entity';
import type {
  CreateDomesticTransferInput,
  DomesticTransferBankAccount,
  IDomesticTransferRepository,
  ListDomesticTransferFilter,
} from '../../../domain/repositories/domestic-transfer.repository';
import { toVietnamBusinessDate } from '../business-date';

@Injectable()
export class PrismaDomesticTransferRepository implements IDomesticTransferRepository {
  constructor(private readonly prisma: PrismaService) {}

  async create(input: CreateDomesticTransferInput): Promise<DomesticTransferTransaction> {
    const now = new Date();
    const businessDate = toVietnamBusinessDate(now);
    const posting = domesticTransferPosting(input.transferType, input.amount, input.fee);
    const { cashAmount } = posting;

    const transactionId = await this.prisma.$transaction(async (tx) => {
      const shift = await this.ensureOpenShift(tx, input.branchId);
      const cashAccount = await tx.fund_accounts.findFirst({
        where: {
          branch_id: input.branchId,
          currency_code: 'VND',
          account_type: 'CASH',
          status: 'ACTIVE',
        },
        select: { id: true },
      });
      if (!cashAccount) throw new BadRequestException('Chi nhánh chưa có sổ quỹ tiền mặt VND');

      await tx.$queryRaw`SELECT id FROM fund_accounts WHERE id = ${cashAccount.id}::uuid FOR UPDATE`;
      await tx.$queryRaw`SELECT id FROM bank_accounts WHERE id = ${input.bankAccountId}::uuid FOR UPDATE`;
      const bankAccount = await tx.bank_accounts.findUnique({
        where: { id: input.bankAccountId },
        include: { banks: true },
      });
      if (!bankAccount || bankAccount.status !== 'ACTIVE') {
        throw new NotFoundException('Không tìm thấy tài khoản ngân hàng đang hoạt động');
      }
      if (bankAccount.currency_code !== 'VND') {
        throw new BadRequestException('Giao dịch chuyển tiền hiện chỉ hỗ trợ tài khoản ngân hàng VND');
      }

      const cashBalance = await this.cashBalance(tx, cashAccount.id);
      const bankBalance = Number(bankAccount.current_balance);
      if (input.transferType === 'BANK_TO_CASH' && cashAmount > cashBalance) {
        throw new BadRequestException(`Không đủ tiền mặt VND. Tồn ${cashBalance}, cần trả ${cashAmount}`);
      }
      if (input.transferType === 'CASH_TO_BANK' && input.amount > bankBalance) {
        throw new BadRequestException(`Tài khoản ngân hàng không đủ số dư. Có ${bankBalance}, cần chuyển ${input.amount}`);
      }

      const transaction = await tx.customer_transactions.create({
        data: {
          transaction_no: `DT-${Date.now()}-${Math.floor(Math.random() * 1000)}`,
          operation_code: 'DOMESTIC_TRANSFER',
          branch_id: input.branchId,
          shift_id: shift.id,
          business_date: businessDate,
          status: 'COMPLETED',
          customer_name: input.customerName?.trim() || null,
          customer_phone: input.customerPhone?.trim() || null,
          amount: input.amount,
          currency_code: 'VND',
          vnd_amount: input.amount,
          created_by_user_id: input.createdByUserId,
        },
      });

      await tx.domestic_transfer_details.create({
        data: {
          transaction_id: transaction.id,
          transfer_type: input.transferType,
          bank_account_id: bankAccount.id,
          fee: input.fee,
          counterparty_bank: input.counterpartyBank?.trim() || null,
          counterparty_account: input.counterpartyAccount?.trim() || null,
          transfer_reference: input.transferReference.trim(),
          beneficiary_name: input.customerName?.trim() || 'Khách hàng',
          beneficiary_phone: input.customerPhone?.trim() || null,
          transfer_note: input.transferNote?.trim() || null,
        },
      });

      await tx.ledger_entries.create({
        data: {
          entry_no: `DT-${transaction.transaction_no}`,
          business_date: businessDate,
          branch_id: input.branchId,
          shift_id: shift.id,
          source_type: 'CUSTOMER_TRANSACTION',
          source_id: transaction.id,
          status: 'POSTED',
          posted_at: now,
          description: input.transferType === 'CASH_TO_BANK'
            ? `Nhận tiền mặt, chuyển khoản ${transaction.transaction_no}`
            : `Nhận chuyển khoản, trả tiền mặt ${transaction.transaction_no}`,
          created_by_user_id: input.createdByUserId,
          ledger_lines: {
            create: [{
              fund_account_id: cashAccount.id,
              direction: posting.cashDirection,
              amount: cashAmount,
              currency_code: 'VND',
              exchange_rate: 1,
              base_amount_vnd: cashAmount,
            }],
          },
        },
      });

      const bankBalanceAfter = bankBalance + posting.bankDelta;
      await tx.bank_balance_movements.create({
        data: {
          movement_no: `DT-BM-${Date.now()}-${Math.floor(Math.random() * 1000)}`,
          bank_account_id: bankAccount.id,
          branch_id: input.branchId,
          movement_type: input.transferType === 'CASH_TO_BANK' ? 'ADVANCE_CK' : 'TRANSFER_IN',
          business_date: businessDate,
          amount: input.amount,
          currency_code: 'VND',
          balance_before: bankBalance,
          balance_after: bankBalanceAfter,
          bank_reference: `DOMESTIC:${transaction.id}`,
          description: input.transferType === 'CASH_TO_BANK'
            ? `${transaction.transaction_no} - Ứng CK cho giao dịch nhận tiền mặt: ${input.transferNote?.trim() || 'Giao dịch chuyển tiền'}`
            : `${transaction.transaction_no} - ${input.transferNote?.trim() || 'Giao dịch chuyển tiền'}`,
          status: 'POSTED',
          posted_at: now,
          created_by_user_id: input.createdByUserId,
        },
      });
      await tx.bank_accounts.update({
        where: { id: bankAccount.id },
        data: { current_balance: bankBalanceAfter, available_balance: bankBalanceAfter },
      });

      return transaction.id;
    });

    return (await this.findById(transactionId))!;
  }

  async findById(id: string): Promise<DomesticTransferTransaction | null> {
    const row = await this.prisma.customer_transactions.findUnique({
      where: { id },
      include: {
        domestic_transfer_details: { include: { bank_accounts: { include: { banks: true } } } },
        shifts: { select: { shift_code: true } },
      },
    });
    return row?.domestic_transfer_details ? toDomain(row) : null;
  }

  async list(filter?: ListDomesticTransferFilter): Promise<DomesticTransferTransaction[]> {
    const rows = await this.prisma.customer_transactions.findMany({
      where: {
        operation_code: 'DOMESTIC_TRANSFER',
        ...(filter?.branchId && { branch_id: filter.branchId }),
      },
      include: {
        domestic_transfer_details: { include: { bank_accounts: { include: { banks: true } } } },
        shifts: { select: { shift_code: true } },
      },
      orderBy: { created_at: 'desc' },
    });
    return rows.filter((row) => row.domestic_transfer_details).map(toDomain);
  }

  async listBankAccounts(): Promise<DomesticTransferBankAccount[]> {
    const accounts = await this.prisma.bank_accounts.findMany({
      where: { status: 'ACTIVE', currency_code: 'VND' },
      include: { banks: true },
      orderBy: [{ banks: { code: 'asc' } }, { account_no: 'asc' }],
    });
    return accounts.map((account) => ({
      id: account.id,
      bankCode: account.banks.code,
      bankName: account.banks.name,
      accountNo: account.account_no,
      accountName: account.account_name,
      currentBalance: Number(account.current_balance),
    }));
  }

  private async ensureOpenShift(tx: any, branchId: string) {
    await tx.$queryRaw`SELECT id FROM shifts WHERE branch_id = ${branchId}::uuid AND status = 'OPEN' FOR SHARE`;
    const shift = await tx.shifts.findFirst({ where: { branch_id: branchId, status: 'OPEN' } });
    if (!shift) {
      throw new BadRequestException('Chi nhánh chưa mở ca và kiểm quỹ đầu ca');
    }
    return shift;
  }

  private async cashBalance(tx: any, accountId: string): Promise<number> {
    const lines = await tx.ledger_lines.findMany({
      where: { fund_account_id: accountId, ledger_entries: { status: 'POSTED' } },
      select: { direction: true, amount: true },
    });
    return lines.reduce(
      (sum: number, line: any) => sum + (line.direction === 'DEBIT' ? Number(line.amount) : -Number(line.amount)),
      0,
    );
  }
}

function toDomain(row: any): DomesticTransferTransaction {
  const detail = row.domestic_transfer_details;
  const bankAccount = detail.bank_accounts;
  const amount = Number(row.amount);
  const fee = Number(detail.fee);
  return {
    id: row.id,
    transactionNo: row.transaction_no,
    branchId: row.branch_id,
    shiftId: row.shift_id,
    shiftCode: row.shifts?.shift_code,
    businessDate: row.business_date,
    status: row.status,
    transferType: detail.transfer_type,
    customerName: row.customer_name,
    customerPhone: row.customer_phone,
    bankAccountId: detail.bank_account_id,
    bankAccountLabel: bankAccount
      ? `${bankAccount.banks.code} - ${bankAccount.account_no}`
      : 'Tài khoản chưa xác định',
    counterpartyBank: detail.counterparty_bank,
    counterpartyAccount: detail.counterparty_account,
    transferReference: detail.transfer_reference,
    amount,
    fee,
    cashAmount: detail.transfer_type === 'CASH_TO_BANK' ? amount + fee : amount - fee,
    transactionValueVnd: amount,
    transferNote: detail.transfer_note,
    createdByUserId: row.created_by_user_id,
    createdAt: row.created_at,
  };
}
