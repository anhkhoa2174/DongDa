import { Controller, Get, NotFoundException, Param, Patch, Query, Request, UseGuards } from '@nestjs/common';
import { PrismaService } from '../../../infrastructure/database/prisma.service';
import { JwtAuthGuard } from '../guards/jwt-auth.guard';

const SOURCE_META: Record<string, { category: string; path: string }> = {
  ACCOUNT_CREATED: { category: 'ACCOUNT', path: '/user-management/users' },
  ACCOUNT_UPDATED: { category: 'ACCOUNT', path: '/user-management/users' },
  ACCOUNT_DEACTIVATED: { category: 'ACCOUNT', path: '/user-management/users' },
  PASSWORD_CHANGED: { category: 'ACCOUNT', path: '/dashboard' },
  REPORT_GENERATED: { category: 'REPORT', path: '/reports' },
  FUND_TRANSFER_CREATED: { category: 'FUND_TRANSFER', path: '/fund-transfer' },
  FUND_TRANSFER_CONFIRMED: { category: 'FUND_TRANSFER', path: '/fund-transfer' },
  FUND_TRANSFER_REJECTED: { category: 'FUND_TRANSFER', path: '/fund-transfer' },
  CENTRAL_FUND_MOVEMENT: { category: 'FUND_MOVEMENT', path: '/fund-management/central-fund' },
  CENTRAL_FUND_CONVERSION: { category: 'FUND_MOVEMENT', path: '/fund-management/central-fund' },
  BRANCH_FUND_MOVEMENT: { category: 'FUND_MOVEMENT', path: '/fund-management/branch-funds' },
  SHIFT_CASH_COUNT: { category: 'SHIFT', path: '/shift-management/active-shift' },
  DEBT_SETTLED: { category: 'DEBT', path: '/debt-management' },
  DEBT_PARTIALLY_SETTLED: { category: 'DEBT', path: '/debt-management' },
  RECONCILIATION_VARIANCE: { category: 'RECONCILIATION', path: '/reconciliation' },
  TRANSACTION_ADJUSTMENT_REQUEST: { category: 'TRANSACTION', path: '/transactions' },
  TRANSACTION_ADJUSTMENT_APPROVED: { category: 'TRANSACTION', path: '/transactions' },
  TRANSACTION_ADJUSTMENT_REJECTED: { category: 'TRANSACTION', path: '/transactions' },
  TRANSACTION_VOIDED: { category: 'TRANSACTION', path: '/transactions' },
};

@Controller('notifications')
@UseGuards(JwtAuthGuard)
export class NotificationController {
  constructor(private readonly prisma: PrismaService) {}

  @Get()
  async list(@Request() req: any, @Query('status') status?: string) {
    const rows = await this.prisma.notifications.findMany({
      where: {
        recipient_user_id: req.user.id,
        ...(status && { status: status.toUpperCase() }),
      },
      orderBy: { created_at: 'desc' },
      take: 100,
    });
    return rows.map((row) => toNotificationResponse(row, req.user.role));
  }

  @Get('unread-count')
  async unreadCount(@Request() req: any) {
    const count = await this.prisma.notifications.count({
      where: { recipient_user_id: req.user.id, status: 'UNREAD' },
    });
    return { count };
  }

  @Patch('read-all')
  async readAll(@Request() req: any) {
    const result = await this.prisma.notifications.updateMany({
      where: { recipient_user_id: req.user.id, status: 'UNREAD' },
      data: { status: 'READ' },
    });
    return { updated: result.count };
  }

  @Patch(':id/read')
  async read(@Request() req: any, @Param('id') id: string) {
    const result = await this.prisma.notifications.updateMany({
      where: { id, recipient_user_id: req.user.id },
      data: { status: 'READ' },
    });
    if (result.count !== 1) throw new NotFoundException('Không tìm thấy thông báo');
    return { id, status: 'READ' };
  }
}

function toNotificationResponse(row: any, role: string) {
  const sourceType = row.source_type ?? 'SYSTEM';
  const meta = SOURCE_META[sourceType] ?? { category: 'SYSTEM', path: '/dashboard' };
  return {
    id: row.id,
    title: row.title,
    body: row.body,
    status: row.status,
    sourceType,
    sourceId: row.source_id,
    category: meta.category,
    path: meta.category === 'ACCOUNT' && role !== 'ADMIN' ? '/dashboard' : meta.path,
    createdAt: row.created_at,
  };
}
