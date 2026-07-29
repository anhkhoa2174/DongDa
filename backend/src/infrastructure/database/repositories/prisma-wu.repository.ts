// Prisma WU Repository — tạo GD Western Union (atomic: ca + quỹ + công nợ)
// Layer: Infrastructure

import { Injectable, BadRequestException } from '@nestjs/common';
import { PrismaService } from '../prisma.service';
import { IWuRepository, CreateWuInput, ListWuFilter } from '../../../domain/repositories/wu.repository';
import { WuTransaction, Currency2, wuImpliedRate, wuProfit } from '../../../domain/entities/wu.entity';

@Injectable()
export class PrismaWuRepository implements IWuRepository {
  constructor(private readonly prisma: PrismaService) {}

  async create(input: CreateWuInput): Promise<WuTransaction> {
    const now = new Date();
    const rate = input.appliedRate;

    const txnId = await this.prisma.$transaction(async (tx) => {
      // 1. Đảm bảo có ca mở (tự mở ngầm nếu chưa có)
      const shift = await this.ensureShift(tx, input.branchId, input.createdByUserId, now);

      // 2. customer_transaction (WU, COMPLETED)
      const txn = await tx.customer_transactions.create({
        data: {
          transaction_no: `WU-${Date.now()}-${Math.floor(Math.random() * 1000)}`,
          operation_code: 'WU',
          branch_id: input.branchId,
          shift_id: shift.id,
          business_date: now,
          status: 'COMPLETED',
          customer_name: input.customerName ?? null,
          amount: input.wuUsdAmount,
          currency_code: 'USD',
          vnd_amount: input.wuVndAmount,
          created_by_user_id: input.createdByUserId,
        },
      });

      // 3. Chi tiết WU (snapshot tỷ giá)
      await tx.wu_transaction_details.create({
        data: {
          transaction_id: txn.id,
          mtcn: input.mtcn,
          wu_usd_amount: input.wuUsdAmount,
          wu_vnd_amount: input.wuVndAmount,
          received_usd: input.receivedUsd,
          received_vnd: input.receivedVnd,
          wu_rate: wuImpliedRate(input.wuVndAmount, input.wuUsdAmount),
          system_rate: input.systemRate,
          applied_rate: rate,
        },
      });

      // 4. Ledger: trả khách → quỹ tiền mặt GIẢM (CREDIT)
      const lines: any[] = [];
      if (input.receivedVnd > 0) {
        const acc = await this.cashAccount(tx, input.branchId, 'VND');
        lines.push({ fund_account_id: acc, direction: 'CREDIT', amount: input.receivedVnd,
          currency_code: 'VND', exchange_rate: 1, base_amount_vnd: input.receivedVnd });
      }
      if (input.receivedUsd > 0) {
        const acc = await this.cashAccount(tx, input.branchId, 'USD');
        lines.push({ fund_account_id: acc, direction: 'CREDIT', amount: input.receivedUsd,
          currency_code: 'USD', exchange_rate: rate, base_amount_vnd: input.receivedUsd * rate });
      }
      if (lines.length === 0) throw new BadRequestException('Phải trả khách ít nhất 1 loại tiền (USD hoặc VND)');

      await tx.ledger_entries.create({
        data: {
          entry_no: `WU-${txn.transaction_no}`,
          business_date: now,
          branch_id: input.branchId,
          shift_id: shift.id,
          source_type: 'CUSTOMER_TRANSACTION',
          source_id: txn.id,
          status: 'POSTED',
          posted_at: now,
          description: `WU chi trả MSKH ${input.mtcn}`,
          created_by_user_id: input.createdByUserId,
          ledger_lines: { create: lines },
        },
      });

      // 5. Công nợ WU tăng (Paid Currency)
      const debtAmount = input.paidCurrency === 'USD' ? input.wuUsdAmount : input.wuVndAmount;
      const debtAcc = await this.ensureDebtAccount(tx, input.branchId, 'WU', input.paidCurrency);
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
          description: `Công nợ WU MSKH ${input.mtcn}`,
          created_by_user_id: input.createdByUserId,
        },
      });

      return txn.id;
    });

    return (await this.findById(txnId))!;
  }

  async findById(id: string): Promise<WuTransaction | null> {
    const row = await this.prisma.customer_transactions.findUnique({
      where: { id },
      include: { wu_transaction_details: true },
    });
    return row?.wu_transaction_details ? toDomain(row) : null;
  }

  async list(filter?: ListWuFilter): Promise<WuTransaction[]> {
    const rows = await this.prisma.customer_transactions.findMany({
      where: { operation_code: 'WU', ...(filter?.branchId && { branch_id: filter.branchId }) },
      include: { wu_transaction_details: true },
      orderBy: { created_at: 'desc' },
    });
    return rows.filter((r) => r.wu_transaction_details).map(toDomain);
  }

  // ── helpers (dùng trong transaction) ──────────────────────

  private async ensureShift(tx: any, branchId: string, _userId: string, _now: Date) {
    // Bắt buộc ca đã mở (BR-F8.2-01) — KHÔNG tự mở ngầm nữa
    const open = await tx.shifts.findFirst({
      where: { branch_id: branchId, status: { in: ['OPEN', 'ACTIVE'] } },
    });
    if (!open) throw new BadRequestException('Chi nhánh chưa mở ca — vui lòng mở ca trước khi giao dịch');
    return open;
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

function toDomain(row: any): WuTransaction {
  const d = row.wu_transaction_details;
  const wuUsd = Number(d.wu_usd_amount);
  const wuRate = Number(d.wu_rate);
  const applied = Number(d.applied_rate);
  return {
    id: row.id,
    transactionNo: row.transaction_no,
    branchId: row.branch_id,
    shiftId: row.shift_id,
    businessDate: row.business_date,
    status: row.status,
    customerName: row.customer_name ?? null,
    mtcn: d.mtcn,
    wuUsdAmount: wuUsd,
    wuVndAmount: Number(d.wu_vnd_amount),
    receivedUsd: Number(d.received_usd),
    receivedVnd: Number(d.received_vnd),
    wuRate,
    systemRate: Number(d.system_rate),
    appliedRate: applied,
    paidCurrency: 'USD',
    profit: wuProfit(wuRate, applied, wuUsd),
    createdByUserId: row.created_by_user_id,
    createdAt: row.created_at,
  };
}
