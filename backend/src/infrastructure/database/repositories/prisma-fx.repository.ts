// Prisma FX Repository — mua/bán ngoại tệ (atomic: ca + quỹ VND + tồn ngoại tệ)
// Layer: Infrastructure

import { Injectable, BadRequestException } from '@nestjs/common';
import { PrismaService } from '../prisma.service';
import { toVietnamBusinessDate } from '../business-date';
import { IFxRepository, CreateFxInput, ListFxFilter } from '../../../domain/repositories/fx.repository';
import { calculateFxVndAmount, FxTransaction, CurrencyCode } from '../../../domain/entities/fx.entity';
import { canonicalActiveFundAccount } from '../canonical-fund-account';
import { claimFinancialRequest, completeFinancialRequest } from '../financial-idempotency';

@Injectable()
export class PrismaFxRepository implements IFxRepository {
  constructor(private readonly prisma: PrismaService) {}

  async create(input: CreateFxInput): Promise<FxTransaction> {
    const now = new Date();
    const businessDate = toVietnamBusinessDate(now);
    const { grossVndAmount, vndAmount } = calculateFxVndAmount(input);
    const idempotencyScope = `FX_CREATE:${input.createdByUserId}`;

    const txnId = await this.prisma.$transaction(async (tx) => {
      const replay = await claimFinancialRequest<{ transactionId: string }>(
        tx, idempotencyScope, input.idempotencyKey, input,
      );
      if (replay) return replay.transactionId;

      const shift = await this.ensureShift(tx, input.branchId);
      const vndAcc = await this.cashAccount(tx, input.branchId, 'VND');
      const fxAcc = await this.currencyAccount(tx, input.branchId, input.fxCurrency);

      // BÁN: kiểm tra tồn ngoại tệ đủ (BR-F5.6)
      if (!input.isBuy) {
        await this.lockFundAccount(tx, fxAcc);
        const stock = await this.balance(tx, fxAcc);
        if (input.fxAmount > stock) {
          throw new BadRequestException(`Không đủ tồn ${input.fxCurrency} (còn ${stock})`);
        }
      }
      if (input.isBuy) {
        await this.lockFundAccount(tx, vndAcc);
        const vndBalance = await this.balance(tx, vndAcc);
        if (vndAmount > vndBalance) {
          throw new BadRequestException(`Không đủ tiền mặt VND. Tồn hiện tại ${vndBalance}, cần chi ${vndAmount}`);
        }
      }

      const txn = await tx.customer_transactions.create({
        data: {
          transaction_no: `FX-${Date.now()}-${Math.floor(Math.random() * 1000)}`,
          operation_code: 'FX',
          branch_id: input.branchId,
          shift_id: shift.id,
          business_date: businessDate,
          status: 'COMPLETED',
          customer_name: input.customerName ?? null,
          amount: input.fxAmount,
          currency_code: input.fxCurrency,
          vnd_amount: vndAmount,
          created_by_user_id: input.createdByUserId,
        },
      });

      await tx.fx_transaction_details.create({
        data: {
          transaction_id: txn.id,
          fx_currency: input.fxCurrency,
          fx_amount: input.fxAmount,
          rate: input.rate,
          is_buy: input.isBuy,
          fractional_amount: input.fractionalAmount,
          fractional_rate: input.fractionalRate,
          deduction_vnd: input.deductionVnd,
        },
      });

      // Ledger 2 lines
      const vndLine = {
        fund_account_id: vndAcc,
        direction: input.isBuy ? 'CREDIT' : 'DEBIT', // mua: VND ra; bán: VND vào
        amount: vndAmount, currency_code: 'VND', exchange_rate: 1, base_amount_vnd: vndAmount,
      };
      const fxLine = {
        fund_account_id: fxAcc,
        direction: input.isBuy ? 'DEBIT' : 'CREDIT', // mua: ngoại tệ vào; bán: ngoại tệ ra
        amount: input.fxAmount, currency_code: input.fxCurrency, exchange_rate: input.rate, base_amount_vnd: vndAmount,
      };
      await tx.ledger_entries.create({
        data: {
          entry_no: `FX-${txn.transaction_no}`,
          business_date: businessDate,
          branch_id: input.branchId,
          shift_id: shift.id,
          source_type: 'CUSTOMER_TRANSACTION',
          source_id: txn.id,
          status: 'POSTED',
          posted_at: now,
          description: input.isBuy
            ? `Mua ${input.fxAmount} ${input.fxCurrency}; gộp ${grossVndAmount} VND; khấu trừ ${input.deductionVnd} VND`
            : `Bán ${input.fxAmount} ${input.fxCurrency}`,
          created_by_user_id: input.createdByUserId,
          ledger_lines: { create: [vndLine, fxLine] as any },
        },
      });

      await completeFinancialRequest(
        tx, idempotencyScope, input.idempotencyKey, { transactionId: txn.id },
      );
      return txn.id;
    });

    return (await this.findById(txnId))!;
  }

  async findById(id: string): Promise<FxTransaction | null> {
    const row = await this.prisma.customer_transactions.findUnique({
      where: { id },
      include: { fx_transaction_details: true, shifts: { select: { shift_code: true } } },
    });
    return row?.fx_transaction_details ? toDomain(row) : null;
  }

  async list(filter?: ListFxFilter): Promise<FxTransaction[]> {
    const rows = await this.prisma.customer_transactions.findMany({
      where: { operation_code: 'FX', ...(filter?.branchId && { branch_id: filter.branchId }) },
      include: { fx_transaction_details: true, shifts: { select: { shift_code: true } } },
      orderBy: { created_at: 'desc' },
    });
    return rows.filter((r) => r.fx_transaction_details).map(toDomain);
  }

  async currencyStock(branchId?: string) {
    // Tồn quỹ phục vụ form FX = Quỹ gốc VND/USD + các sổ Quỹ A.
    const accounts = await this.prisma.fund_accounts.findMany({
      where: {
        status: 'ACTIVE',
        ...(branchId && { branch_id: branchId }),
        OR: [
          { account_type: 'FUND_A' },
          { account_type: 'CASH', currency_code: { in: ['VND', 'USD'] } },
        ],
      },
    });
    const ledgerLines = accounts.length === 0
      ? []
      : await this.prisma.ledger_lines.findMany({
        where: {
          fund_account_id: { in: accounts.map((account) => account.id) },
          ledger_entries: { status: 'POSTED' },
        },
        select: { fund_account_id: true, direction: true, amount: true },
      });
    const balanceByAccount = new Map<string, number>();
    for (const line of ledgerLines) {
      const signedAmount = line.direction === 'DEBIT' ? Number(line.amount) : -Number(line.amount);
      balanceByAccount.set(line.fund_account_id, (balanceByAccount.get(line.fund_account_id) ?? 0) + signedAmount);
    }
    const stockByBranchCurrency = new Map<string, { branchId: string; currency: CurrencyCode; balance: number }>();
    for (const a of accounts) {
      const currency = a.currency_code as CurrencyCode;
      const key = `${a.branch_id}:${currency}`;
      const current = stockByBranchCurrency.get(key);
      stockByBranchCurrency.set(key, {
        branchId: a.branch_id,
        currency,
        balance: (current?.balance ?? 0) + (balanceByAccount.get(a.id) ?? 0),
      });
    }
    return [...stockByBranchCurrency.values()];
  }

  // ── helpers ──
  private async ensureShift(tx: any, branchId: string) {
    await tx.$queryRaw`SELECT id FROM shifts WHERE branch_id = ${branchId}::uuid AND status = 'OPEN' FOR SHARE`;
    const open = await tx.shifts.findFirst({ where: { branch_id: branchId, status: 'OPEN' } });
    if (open) return open;
    throw new BadRequestException('Chi nhánh chưa mở ca. Vui lòng mở ca và kiểm quỹ đầu ca trước khi tạo giao dịch ngoại tệ.');
  }

  private async cashAccount(tx: any, branchId: string, currency: string): Promise<string> {
    const acc = await canonicalActiveFundAccount(tx, branchId, currency as CurrencyCode);
    if (!acc) throw new BadRequestException(`Chi nhánh chưa có sổ quỹ tiền mặt ${currency}`);
    return acc.id;
  }

  private async lockFundAccount(tx: any, fundAccountId: string) {
    await tx.$queryRaw`SELECT id FROM fund_accounts WHERE id = ${fundAccountId}::uuid FOR UPDATE`;
  }

  // Sổ ngoại tệ: USD dùng CASH_USD (đã seed), còn lại tạo Quỹ A (FUND_A) khi cần
  private async currencyAccount(tx: any, branchId: string, currency: CurrencyCode): Promise<string> {
    const account = await canonicalActiveFundAccount(tx, branchId, currency, true);
    return account.id;
  }

  private async balance(db: any, fundAccountId: string): Promise<number> {
    const lines = await db.ledger_lines.findMany({
      where: { fund_account_id: fundAccountId, ledger_entries: { status: 'POSTED' } },
      select: { direction: true, amount: true },
    });
    return lines.reduce((s: number, l: any) => s + (l.direction === 'DEBIT' ? Number(l.amount) : -Number(l.amount)), 0);
  }
}

function toDomain(row: any): FxTransaction {
  const d = row.fx_transaction_details;
  return {
    id: row.id,
    transactionNo: row.transaction_no,
    branchId: row.branch_id,
    shiftId: row.shift_id,
    businessDate: row.business_date,
    status: row.status,
    customerName: row.customer_name ?? null,
    customerPhone: row.customer_phone ?? null,
    shiftCode: row.shifts?.shift_code,
    isBuy: d.is_buy,
    fxCurrency: d.fx_currency as CurrencyCode,
    fxAmount: Number(d.fx_amount),
    fractionalAmount: Number(d.fractional_amount ?? 0),
    fractionalRate: d.fractional_rate == null ? null : Number(d.fractional_rate),
    deductionVnd: Number(d.deduction_vnd ?? 0),
    rate: Number(d.rate),
    vndAmount: Number(row.vnd_amount),
    createdByUserId: row.created_by_user_id,
    createdAt: row.created_at,
  };
}
