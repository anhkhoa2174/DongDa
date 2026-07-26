// Prisma MG Repository — tạo GD MoneyGram (atomic: ca + quỹ + công nợ)
// Layer: Infrastructure

import { Injectable, BadRequestException } from '@nestjs/common';
import { PrismaService } from '../prisma.service';
import { IMgRepository, CreateMgInput, ListMgFilter } from '../../../domain/repositories/mg.repository';
import { MgTransaction, Currency2, mgImpliedRate, mgProfit } from '../../../domain/entities/mg.entity';

@Injectable()
export class PrismaMgRepository implements IMgRepository {
  constructor(private readonly prisma: PrismaService) {}

  async referenceExists(referenceNo: string): Promise<boolean> {
    const count = await this.prisma.mg_transaction_details.count({ where: { reference_no: referenceNo } });
    return count > 0;
  }

  async create(input: CreateMgInput): Promise<MgTransaction> {
    const now = new Date();
    const rate = input.appliedRate;

    const txnId = await this.prisma.$transaction(async (tx) => {
      const shift = await this.ensureShift(tx, input.branchId, input.createdByUserId, now);

      const txn = await tx.customer_transactions.create({
        data: {
          transaction_no: `MG-${Date.now()}-${Math.floor(Math.random() * 1000)}`,
          operation_code: 'MG',
          branch_id: input.branchId,
          shift_id: shift.id,
          business_date: now,
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
          payout_amount: input.payoutAmount,
          system_rate: input.systemRate,
          applied_rate: rate,
        },
      });

      // Ledger: trả khách → quỹ tiền mặt GIẢM (CREDIT) theo payout_currency
      if (input.payoutAmount > 0) {
        const acc = await this.cashAccount(tx, input.branchId, input.payoutCurrency);
        const baseRate = input.payoutCurrency === 'VND' ? 1 : rate;
        await tx.ledger_entries.create({
          data: {
            entry_no: `MG-${txn.transaction_no}`,
            business_date: now,
            branch_id: input.branchId,
            shift_id: shift.id,
            source_type: 'CUSTOMER_TRANSACTION',
            source_id: txn.id,
            status: 'POSTED',
            posted_at: now,
            description: `MG chi trả Ref ${input.referenceNo}`,
            created_by_user_id: input.createdByUserId,
            ledger_lines: {
              create: [{
                fund_account_id: acc,
                direction: 'CREDIT',
                amount: input.payoutAmount,
                currency_code: input.payoutCurrency,
                exchange_rate: baseRate,
                base_amount_vnd: input.payoutAmount * baseRate,
              }],
            },
          },
        });
      }

      // Công nợ MG tăng (Paid Currency)
      const debtAmount = input.paidCurrency === 'USD' ? input.mgUsdAmount : input.mgVndAmount;
      const debtAcc = await this.ensureDebtAccount(tx, input.branchId, 'MG', input.paidCurrency);
      await tx.debt_movements.create({
        data: {
          debt_account_id: debtAcc,
          branch_id: input.branchId,
          movement_type: 'EXPECTED_DEBT',
          source_type: 'CUSTOMER_TRANSACTION',
          source_id: txn.id,
          business_date: now,
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
      include: { mg_transaction_details: true },
    });
    return row?.mg_transaction_details ? toDomain(row) : null;
  }

  async list(filter?: ListMgFilter): Promise<MgTransaction[]> {
    const rows = await this.prisma.customer_transactions.findMany({
      where: { operation_code: 'MG', ...(filter?.branchId && { branch_id: filter.branchId }) },
      include: { mg_transaction_details: true },
      orderBy: { created_at: 'desc' },
    });
    return rows.filter((r) => r.mg_transaction_details).map(toDomain);
  }

  // ── helpers ──
  private async ensureShift(tx: any, branchId: string, userId: string, now: Date) {
    const open = await tx.shifts.findFirst({ where: { branch_id: branchId, status: { in: ['OPEN', 'ACTIVE'] } } });
    if (open) return open;
    return tx.shifts.create({
      data: {
        branch_id: branchId,
        shift_code: `SH-${branchId.slice(0, 8)}-${Date.now()}`,
        business_date: now,
        status: 'OPEN',
        opened_by_user_id: userId,
        opening_note: 'Ca tự mở khi phát sinh giao dịch',
      },
    });
  }

  private async cashAccount(tx: any, branchId: string, currency: Currency2): Promise<string> {
    const acc = await tx.fund_accounts.findFirst({
      where: { branch_id: branchId, account_type: 'CASH', currency_code: currency, status: 'ACTIVE' },
      select: { id: true },
    });
    if (!acc) throw new BadRequestException(`Chi nhánh chưa có sổ quỹ tiền mặt ${currency}`);
    return acc.id;
  }

  private async ensureDebtAccount(tx: any, branchId: string, provider: string, currency: Currency2): Promise<string> {
    const existing = await tx.debt_accounts.findUnique({
      where: { branch_id_provider_code_currency_code: { branch_id: branchId, provider_code: provider, currency_code: currency } },
    });
    if (existing) return existing.id;
    const created = await tx.debt_accounts.create({
      data: { branch_id: branchId, provider_code: provider, currency_code: currency, name: `Công nợ ${provider} ${currency}` },
    });
    return created.id;
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
    referenceNo: d.reference_no,
    mgUsdAmount: mgUsd,
    mgVndAmount: mgVnd,
    payoutCurrency: d.payout_currency,
    payoutAmount: Number(d.payout_amount),
    mgRate,
    systemRate: Number(d.system_rate),
    appliedRate: applied,
    paidCurrency: 'USD',
    profit: mgProfit(mgRate, applied, mgUsd),
    createdByUserId: row.created_by_user_id,
    createdAt: row.created_at,
  };
}
