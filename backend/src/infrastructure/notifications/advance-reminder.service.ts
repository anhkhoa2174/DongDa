// Nhắc cuối ngày (17:00) các khoản tạm ứng CK CHƯA HOÀN — tránh KTTH quên thao tác hoàn
// (feedback a Kiển: quên hoàn mà chi nhánh phát sinh giao dịch tiếp là mất an toàn tài chính).
// Layer: Infrastructure — cron + đọc trực tiếp bảng biến động, gửi notification cho GĐ/KTTH.

import { Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { PrismaService } from '../database/prisma.service';
import { NotificationService } from './notification.service';

@Injectable()
export class AdvanceReminderService {
  private readonly logger = new Logger(AdvanceReminderService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly notifications: NotificationService,
  ) {}

  @Cron('0 17 * * *', { timeZone: 'Asia/Ho_Chi_Minh' })
  async remindUnsettledAdvances(): Promise<void> {
    try {
      const advances = await this.prisma.bank_balance_movements.findMany({
        where: { movement_type: 'ADVANCE_CK' as never },
        select: { id: true, amount: true, currency_code: true, branch_id: true, bank_reference: true },
      });
      if (!advances.length) return;
      const transactionIds = advances
        .map((advance) => advance.bank_reference?.startsWith('DOMESTIC:')
          ? advance.bank_reference.slice('DOMESTIC:'.length)
          : null)
        .filter((id): id is string => Boolean(id));
      const [settles, voidedTransactions] = await Promise.all([
        this.prisma.bank_balance_movements.findMany({
          where: { movement_type: 'ADVANCE_SETTLE' as never, bank_reference: { in: advances.map((a) => a.id) } },
          select: { bank_reference: true },
        }),
        transactionIds.length > 0
          ? this.prisma.customer_transactions.findMany({
              where: { id: { in: transactionIds }, status: 'VOIDED' },
              select: { id: true },
            })
          : Promise.resolve([]),
      ]);
      const done = new Set(settles.map((s) => s.bank_reference));
      const voided = new Set(voidedTransactions.map((transaction) => transaction.id));
      const pending = advances.filter((advance) => {
        const transactionId = advance.bank_reference?.startsWith('DOMESTIC:')
          ? advance.bank_reference.slice('DOMESTIC:'.length)
          : null;
        return !done.has(advance.id) && (!transactionId || !voided.has(transactionId));
      });
      if (!pending.length) return;

      const byCurrency = new Map<string, number>();
      for (const a of pending) {
        const key = String(a.currency_code);
        byCurrency.set(key, (byCurrency.get(key) ?? 0) + Number(a.amount));
      }
      const totals = [...byCurrency.entries()]
        .map(([ccy, sum]) => `${sum.toLocaleString('vi-VN')} ${ccy}`)
        .join(' · ');
      await this.notifications.notifyUsers({
        title: `Còn ${pending.length} khoản tạm ứng CK chưa hoàn`,
        body: `Tổng chưa hoàn: ${totals}. Vào Ngân hàng → "Tạm ứng CK chưa hoàn" để hoàn trước khi chốt ngày.`,
        sourceType: 'ADVANCE_CK_UNSETTLED',
        sourceId: pending[0].id,
      }, {
        roles: ['ADMIN', 'MANAGER'],
      });
    } catch (error) {
      this.logger.warn(`Nhắc tạm ứng CK thất bại: ${(error as Error).message}`);
    }
  }
}
