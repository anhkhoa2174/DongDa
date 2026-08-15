// Prisma MG Repository — tạo GD MoneyGram (atomic: ca + quỹ + công nợ)
// Layer: Infrastructure

import { Injectable, BadRequestException, ConflictException } from '@nestjs/common';
import { PrismaService } from '../prisma.service';
import { IMgRepository, CreateMgInput, ListMgFilter } from '../../../domain/repositories/mg.repository';
import { MgTransaction, Currency2, mgImpliedRate } from '../../../domain/entities/mg.entity';
import { toVietnamBusinessDate } from '../business-date';

@Injectable()
export class PrismaMgRepository implements IMgRepository {
  constructor(private readonly prisma: PrismaService) {}

  async referenceExists(referenceNo: string): Promise<boolean> {
    const count = await this.prisma.mg_transaction_details.count({
      where: { reference_no: referenceNo, customer_transactions: { status: 'COMPLETED' } },
    });
    return count > 0;
  }

  async create(input: CreateMgInput): Promise<MgTransaction> {
    const now = new Date();
    const businessDate = toVietnamBusinessDate(now);
    const rate = input.appliedRate;

    const txnId = await this.prisma.$transaction(async (tx) => {
      const shift = await this.ensureShift(tx, input.branchId);
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${'MG:' + input.referenceNo}))`;
      const duplicate = await tx.mg_transaction_details.count({
        where: { reference_no: input.referenceNo, customer_transactions: { status: 'COMPLETED' } },
      });
      if (duplicate > 0) throw new ConflictException(`Reference Number ${input.referenceNo} đã được xử lý`);

      const txn = await tx.customer_transactions.create({
        data: {
          transaction_no: `MG-${Date.now()}-${Math.floor(Math.random() * 1000)}`,
          operation_code: 'MG',
          branch_id: input.branchId,
          shift_id: shift.id,
          business_date: businessDate,
          status: 'COMPLETED',
          customer_name: input.customerName ?? null,
          amount: input.mgUsdAmount,
          currency_code: 'USD',
          vnd_amount: input.mgVndAmount,
          created_by_user_id: input.createdByUserId,
        },
      });

      await tx.mg_transaction_details.create({
        data: {
          transaction_id: txn.id,
          reference_no: input.referenceNo,
          payout_currency: input.payoutCurrency,
          paid_currency: input.paidCurrency,
          payout_amount: input.payoutAmount,
          received_usd: input.receivedUsd,
          received_vnd: input.receivedVnd,
          system_rate: input.systemRate,
          applied_rate: rate,
        },
      });

      // Ledger: trả khách → quỹ tiền mặt GIẢM (CREDIT).
      // Nếu khách nhận USD lẻ, phần chẵn chi USD và phần lẻ quy đổi chi VND.
      const lines: any[] = [];
      if (input.receivedUsd > 0) {
        const acc = await this.cashAccount(tx, input.branchId, 'USD');
        await this.ensureEnoughBalance(tx, acc, input.receivedUsd, 'USD');
        lines.push({
          fund_account_id: acc,
          direction: 'CREDIT',
          amount: input.receivedUsd,
          currency_code: 'USD',
          exchange_rate: rate,
          base_amount_vnd: input.receivedUsd * rate,
        });
      }
      if (input.receivedVnd > 0) {
        const acc = await this.cashAccount(tx, input.branchId, 'VND');
        await this.ensureEnoughBalance(tx, acc, input.receivedVnd, 'VND');
        lines.push({
          fund_account_id: acc,
          direction: 'CREDIT',
          amount: input.receivedVnd,
          currency_code: 'VND',
          exchange_rate: 1,
          base_amount_vnd: input.receivedVnd,
        });
      }
      if (lines.length === 0) throw new BadRequestException('Phải trả khách ít nhất 1 loại tiền (USD hoặc VND)');

      await tx.ledger_entries.create({
        data: {
          entry_no: `MG-${txn.transaction_no}`,
          business_date: businessDate,
          branch_id: input.branchId,
          shift_id: shift.id,
          source_type: 'CUSTOMER_TRANSACTION',
          source_id: txn.id,
          status: 'POSTED',
          posted_at: now,
          description: `MG chi trả Ref ${input.referenceNo}`,
          created_by_user_id: input.createdByUserId,
          ledger_lines: { create: lines },
        },
      });

      // Công nợ MG tăng (Paid Currency)
      const debtAmount = input.paidCurrency === 'USD' ? input.mgUsdAmount : input.mgVndAmount;
      const debtAcc = await this.ensureDebtAccount(tx, input.branchId, 'MG', input.paidCurrency, businessDate);
      await tx.debt_movements.create({
        data: {
          debt_account_id: debtAcc,
          branch_id: input.branchId,
          movement_type: 'EXPECTED_DEBT',
          source_type: 'CUSTOMER_TRANSACTION',
          source_id: txn.id,
          business_date: businessDate,
          amount: debtAmount,
          currency_code: input.paidCurrency,
          status: 'POSTED',
          posted_at: now,
          description: `Công nợ MG Ref ${input.referenceNo}`,
          created_by_user_id: input.createdByUserId,
        },
      });

      return txn.id;
    });

    return (await this.findById(txnId))!;
  }

  async findById(id: string): Promise<MgTransaction | null> {
    const row = await this.prisma.customer_transactions.findUnique({
      where: { id },
      include: { mg_transaction_details: true, shifts: { select: { shift_code: true } } },
    });
    return row?.mg_transaction_details ? toDomain(row) : null;
  }

  async list(filter?: ListMgFilter): Promise<MgTransaction[]> {
    const rows = await this.prisma.customer_transactions.findMany({
      where: { operation_code: 'MG', ...(filter?.branchId && { branch_id: filter.branchId }) },
      include: { mg_transaction_details: true, shifts: { select: { shift_code: true } } },
      orderBy: { created_at: 'desc' },
    });
    return rows.filter((r) => r.mg_transaction_details).map(toDomain);
  }

  // ── helpers ──
  private async ensureShift(tx: any, branchId: string) {
    await tx.$queryRaw`SELECT id FROM shifts WHERE branch_id = ${branchId}::uuid AND status = 'OPEN' FOR SHARE`;
    const open = await tx.shifts.findFirst({ where: { branch_id: branchId, status: 'OPEN' } });
    if (open) return open;
    throw new BadRequestException('Chi nhánh chưa mở ca. Vui lòng mở ca và kiểm quỹ đầu ca trước khi tạo giao dịch MG.');
  }

  private async cashAccount(tx: any, branchId: string, currency: Currency2): Promise<string> {
    const acc = await tx.fund_accounts.findFirst({
      where: { branch_id: branchId, account_type: 'CASH', currency_code: currency, status: 'ACTIVE' },
      select: { id: true },
    });
    if (!acc) throw new BadRequestException(`Chi nhánh chưa có sổ quỹ tiền mặt ${currency}`);
    return acc.id;
  }

  private async ensureEnoughBalance(tx: any, fundAccountId: string, amount: number, currency: Currency2) {
    await this.lockFundAccount(tx, fundAccountId);
    const balance = await this.balance(tx, fundAccountId);
    if (amount > balance) {
      throw new BadRequestException(`Không đủ tiền mặt ${currency}. Tồn hiện tại ${balance}, cần chi ${amount}`);
    }
  }

  private async lockFundAccount(tx: any, fundAccountId: string) {
    await tx.$queryRaw`SELECT id FROM fund_accounts WHERE id = ${fundAccountId}::uuid FOR UPDATE`;
  }

  private async balance(tx: any, fundAccountId: string): Promise<number> {
    const lines = await tx.ledger_lines.findMany({
      where: { fund_account_id: fundAccountId, ledger_entries: { status: 'POSTED' } },
      select: { direction: true, amount: true },
    });
    return lines.reduce((sum: number, line: any) => sum + (line.direction === 'DEBIT' ? Number(line.amount) : -Number(line.amount)), 0);
  }

  private async ensureDebtAccount(
    tx: any, branchId: string, provider: string, currency: Currency2, businessDate: Date,
  ): Promise<string> {
    const account = await tx.debt_accounts.upsert({
      where: {
        branch_id_provider_code_currency_code_business_date: {
          branch_id: branchId, provider_code: provider, currency_code: currency, business_date: businessDate,
        },
      },
      update: {},
      create: {
        branch_id: branchId,
        provider_code: provider,
        currency_code: currency,
        business_date: businessDate,
        name: `Công nợ ${provider} ${currency} ngày ${businessDate.toISOString().slice(0, 10)}`,
      },
    });
    return account.id;
  }
}

function toDomain(row: any): MgTransaction {
  const d = row.mg_transaction_details;
  const mgUsd = Number(row.amount);
  const mgVnd = Number(row.vnd_amount);
  const mgRate = mgImpliedRate(mgVnd, mgUsd);
  const applied = Number(d.applied_rate);
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
    referenceNo: d.reference_no,
    mgUsdAmount: mgUsd,
    mgVndAmount: mgVnd,
    payoutCurrency: d.payout_currency,
    payoutAmount: Number(d.payout_amount),
    receivedUsd: Number(d.received_usd ?? 0),
    receivedVnd: Number(d.received_vnd ?? 0),
    mgRate,
    systemRate: Number(d.system_rate),
    appliedRate: applied,
    paidCurrency: d.paid_currency,
    transactionValueVnd: Number(d.received_usd ?? 0) * applied + Number(d.received_vnd ?? 0),
    createdByUserId: row.created_by_user_id,
    createdAt: row.created_at,
  };
}
