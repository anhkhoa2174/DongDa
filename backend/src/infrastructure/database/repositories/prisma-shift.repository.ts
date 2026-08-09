// Prisma Shift Repository — ca làm việc + kiểm quỹ (variance từ ledger)
// Layer: Infrastructure

import { Injectable, NotFoundException, BadRequestException } from '@nestjs/common';
import { PrismaService } from '../prisma.service';
import {
  IShiftRepository, OpenShiftInput, CloseShiftInput, ShiftWithCount,
} from '../../../domain/repositories/shift.repository';
import { Shift, CashCount, CurrencyCode, CountInput } from '../../../domain/entities/shift.entity';
import { NotificationService } from '../../notifications/notification.service';
import { toVietnamBusinessDate } from '../business-date';

@Injectable()
export class PrismaShiftRepository implements IShiftRepository {
  constructor(
    private readonly prisma: PrismaService,
    private readonly notifications: NotificationService,
  ) {}

  async findCurrent(branchId: string): Promise<Shift | null> {
    const row = await this.prisma.shifts.findFirst({
      where: { branch_id: branchId, status: 'OPEN' },
      orderBy: { opened_at: 'desc' },
    });
    return row ? toShift(row) : null;
  }

  async openShift(input: OpenShiftInput): Promise<ShiftWithCount> {
    const now = new Date();
    const result = await this.prisma.$transaction(async (tx) => {
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`SHIFT:${input.branchId}`}))`;
      const existing = await tx.shifts.findFirst({ where: { branch_id: input.branchId, status: 'OPEN' } });
      if (existing) throw new BadRequestException('Chi nhánh đang có ca mở');
      const shift = await tx.shifts.create({
        data: {
          branch_id: input.branchId,
          shift_code: `SH-${input.branchId.slice(0, 8)}-${Date.now()}`,
          business_date: toVietnamBusinessDate(now),
          status: 'OPEN',
          opened_by_user_id: input.openedByUserId,
          opening_note: input.note ?? 'Kiểm quỹ đầu ca',
        },
      });
      const count = await this.createCashCount(tx, shift.id, input.branchId, input.openedByUserId, input.openingCounts, now, 'Kiểm quỹ đầu ca');
      return { shift: toShift(shift), cashCount: count };
    });
    return result;
  }

  async closeShift(input: CloseShiftInput): Promise<ShiftWithCount> {
    const now = new Date();
    const result = await this.prisma.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT id FROM shifts WHERE id = ${input.shiftId}::uuid FOR UPDATE`;
      const shift = await tx.shifts.findUnique({ where: { id: input.shiftId } });
      if (!shift) throw new NotFoundException('Không tìm thấy ca');
      if (input.branchId && shift.branch_id !== input.branchId) throw new BadRequestException('Không thể đóng ca của chi nhánh khác');
      if (shift.status !== 'OPEN') throw new BadRequestException(`Ca không ở trạng thái mở (hiện tại: ${shift.status})`);
      const count = await this.createCashCount(tx, shift.id, shift.branch_id, input.closedByUserId, input.closingCounts, now, 'Kiểm quỹ cuối ca');
      // BR-F8.4-01: có chênh lệch quỹ thì bắt buộc nhập lý do (ghi vào closing_note).
      const variances = count.lines.filter((line) => Number(line.variance) !== 0);
      if (variances.length > 0 && !input.note?.trim()) {
        const detail = variances
          .map((line) => `${line.currencyCode} ${Number(line.variance) > 0 ? '+' : ''}${line.variance}`)
          .join(', ');
        throw new BadRequestException(`Kiểm quỹ cuối ca có chênh lệch (${detail}). Vui lòng nhập lý do chênh lệch để đóng ca.`);
      }
      const claimed = await tx.shifts.updateMany({
        where: { id: shift.id, status: 'OPEN' },
        data: { status: 'CLOSED', closed_by_user_id: input.closedByUserId, closed_at: now, closing_note: input.note ?? 'Kiểm quỹ cuối ca' },
      });
      if (claimed.count !== 1) throw new BadRequestException('Ca đã được đóng bởi yêu cầu khác');
      const updated = await tx.shifts.findUniqueOrThrow({ where: { id: shift.id } });
      await this.notifyCashVariance(tx, shift.branch_id, shift.id, count);
      return { shift: toShift(updated), cashCount: count };
    });
    return result;
  }

  async getCashCount(shiftId: string): Promise<CashCount[]> {
    const counts = await this.prisma.cash_counts.findMany({
      where: { shift_id: shiftId },
      include: { cash_count_lines: true },
      orderBy: { counted_at: 'asc' },
    });
    return counts.map((c: any) => ({
      id: c.id,
      shiftId: c.shift_id,
      branchId: c.branch_id,
      countedAt: c.counted_at,
      lines: c.cash_count_lines.map((l: any) => ({
        currencyCode: l.currency_code as CurrencyCode,
        systemAmount: Number(l.system_amount),
        actualAmount: Number(l.actual_amount),
        variance: Number(l.variance),
      })),
    }));
  }

  // ── helpers ──────────────────────────────────────────────

  private async createCashCount(
    tx: any, shiftId: string, branchId: string, userId: string,
    counts: CountInput[], now: Date, note: string,
  ): Promise<CashCount> {
    const requiredAccounts = await tx.fund_accounts.findMany({
      where: { branch_id: branchId, status: 'ACTIVE', account_type: { in: ['CASH', 'FUND_A'] } },
      select: { currency_code: true },
    });
    const requiredCurrencies = new Set<string>(requiredAccounts.map((account: any) => String(account.currency_code)));
    const submittedCurrencies = new Set<string>(counts.map((count) => String(count.currency)));
    const missing = [...requiredCurrencies].filter((currency) => !submittedCurrencies.has(currency));
    if (missing.length > 0) throw new BadRequestException(`Phiếu kiểm quỹ thiếu loại tiền: ${missing.join(', ')}`);

    const lines: any[] = [];
    const seenCurrencies = new Set<string>();
    for (const c of counts) {
      if (seenCurrencies.has(c.currency)) {
        throw new BadRequestException(`Phiếu kiểm quỹ có loại tiền ${c.currency} bị trùng`);
      }
      seenCurrencies.add(c.currency);

      const accounts = await this.fundAccounts(tx, branchId, c.currency);
      if (accounts.length === 0) throw new BadRequestException(`Chi nhánh chưa có sổ quỹ để kiểm ${c.currency}`);
      const canonicalCode = c.currency === 'VND' || c.currency === 'USD'
        ? `CASH_${c.currency}`
        : `FUND_A_${c.currency}`;
      const canonicalAccount = accounts.find((account) => account.code === canonicalCode) ?? accounts[0];
      let system = 0;
      for (const account of accounts) {
        await tx.$queryRaw`SELECT id FROM fund_accounts WHERE id = ${account.id}::uuid FOR UPDATE`;
        system += await this.balance(tx, account.id);
      }
      lines.push({
        fund_account_id: canonicalAccount.id,
        currency_code: c.currency,
        system_amount: system,
        actual_amount: c.actualAmount,
        variance: c.actualAmount - system,
      });
    }
    const cc = await tx.cash_counts.create({
      data: {
        branch_id: branchId,
        shift_id: shiftId,
        business_date: toVietnamBusinessDate(now),
        status: 'POSTED',
        counted_by_user_id: userId,
        note,
        cash_count_lines: { create: lines },
      },
      include: { cash_count_lines: true },
    });
    return {
      id: cc.id,
      shiftId: cc.shift_id,
      branchId: cc.branch_id,
      countedAt: cc.counted_at,
      lines: cc.cash_count_lines.map((l: any) => ({
        currencyCode: l.currency_code as CurrencyCode,
        systemAmount: Number(l.system_amount),
        actualAmount: Number(l.actual_amount),
        variance: Number(l.variance),
      })),
    };
  }

  // VND/USD → CASH ; ngoại tệ khác → FUND_A
  private async fundAccounts(
    tx: any,
    branchId: string,
    currency: CurrencyCode,
  ): Promise<Array<{ id: string; code: string }>> {
    if (currency === 'VND' || currency === 'USD') {
      return tx.fund_accounts.findMany({
        where: { branch_id: branchId, account_type: 'CASH', currency_code: currency, status: 'ACTIVE' },
        select: { id: true, code: true },
        orderBy: { code: 'asc' },
      });
    }
    return tx.fund_accounts.findMany({
      where: { branch_id: branchId, account_type: 'FUND_A', currency_code: currency, status: 'ACTIVE' },
      select: { id: true, code: true },
      orderBy: { code: 'asc' },
    });
  }

  private async balance(tx: any, fundAccountId: string): Promise<number> {
    const lines = await tx.ledger_lines.findMany({
      where: { fund_account_id: fundAccountId, ledger_entries: { status: 'POSTED' } },
      select: { direction: true, amount: true },
    });
    return lines.reduce((s: number, l: any) => s + (l.direction === 'DEBIT' ? Number(l.amount) : -Number(l.amount)), 0);
  }

  private async notifyCashVariance(tx: any, branchId: string, shiftId: string, count: CashCount) {
    const variances = count.lines.filter((line) => Math.abs(line.variance) >= 0.01);
    if (variances.length === 0) return;

    await this.notifications.notifyUsers({
      title: 'Sai lệch kiểm quỹ khi đóng ca',
      body: variances
        .map((line) => `${line.currencyCode}: hệ thống ${line.systemAmount}, thực đếm ${line.actualAmount}, lệch ${line.variance}`)
        .join('\n'),
      sourceType: 'SHIFT_CASH_COUNT',
      sourceId: shiftId,
    }, {
      roles: ['ADMIN', 'MANAGER'],
      branchIds: [branchId],
    }, tx);
  }
}

function toShift(row: any): Shift {
  return {
    id: row.id,
    branchId: row.branch_id,
    shiftCode: row.shift_code,
    businessDate: row.business_date,
    status: row.status,
    openedByUserId: row.opened_by_user_id,
    openedAt: row.opened_at,
    closedByUserId: row.closed_by_user_id ?? null,
    closedAt: row.closed_at ?? null,
  };
}
