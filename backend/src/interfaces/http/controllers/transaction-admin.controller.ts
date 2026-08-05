import {
  BadRequestException, Body, Controller, ForbiddenException, Get, Param, Patch, Post, Query, Request, UseGuards,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../../infrastructure/database/prisma.service';
import { toVietnamBusinessDate } from '../../../infrastructure/database/business-date';
import { JwtAuthGuard } from '../guards/jwt-auth.guard';
import { Roles, RolesGuard } from '../guards/roles.guard';
import { UserRole } from '../../../domain/entities/user.entity';
import {
  CreateTransactionAdjustmentDto,
  UpdateTransactionMetadataDto,
  VoidTransactionDto,
} from '../../../application/dtos/transactions/transaction-admin.dto';
import { NotificationService } from '../../../infrastructure/notifications/notification.service';

const TRANSACTION_ADJUSTMENT = 'CUSTOMER_TRANSACTION_ADJUSTMENT';

@Controller('transactions')
@UseGuards(JwtAuthGuard, RolesGuard)
export class TransactionAdminController {
  constructor(
    private readonly prisma: PrismaService,
    private readonly notifications: NotificationService,
  ) {}

  @Get('adjustment-requests')
  @Roles(UserRole.ADMIN, UserRole.MANAGER)
  async listAdjustmentRequests(@Query('status') status?: string) {
    const requests = await this.prisma.approval_requests.findMany({
      where: {
        entity_type: TRANSACTION_ADJUSTMENT,
        ...(status && { status: status as any }),
      },
      include: {
        approval_steps: true,
        approval_actions: { orderBy: { acted_at: 'asc' } },
        users: { include: { employees: true } },
      },
      orderBy: { requested_at: 'desc' },
    });
    const transactions = await this.prisma.customer_transactions.findMany({
      where: { id: { in: requests.map((request) => request.entity_id) } },
      include: {
        branches: { select: { code: true, name: true } },
        shifts: { select: { shift_code: true, status: true } },
      },
    });
    const transactionById = new Map(transactions.map((transaction) => [transaction.id, transaction]));
    return requests.map((request) => ({
      ...request,
      transaction: transactionById.get(request.entity_id) ?? null,
    }));
  }

  @Post(':id/adjustment-requests')
  @Roles(UserRole.ADMIN, UserRole.MANAGER, UserRole.STAFF)
  async createAdjustmentRequest(
    @Request() req: any,
    @Param('id') id: string,
    @Body() dto: CreateTransactionAdjustmentDto,
  ) {
    return this.prisma.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT id FROM customer_transactions WHERE id = ${id}::uuid FOR UPDATE`;
      const transaction = await tx.customer_transactions.findUnique({
        where: { id },
        include: { shifts: { select: { status: true, shift_code: true } } },
      });
      if (!transaction) throw new BadRequestException('Không tìm thấy giao dịch');
      if (req.user.role === UserRole.STAFF && transaction.branch_id !== req.user.branchId) {
        throw new ForbiddenException('Nhân viên chỉ được lập phiếu cho giao dịch của chi nhánh mình');
      }
      if (transaction.status !== 'COMPLETED') {
        throw new BadRequestException(`Chỉ lập phiếu cho giao dịch COMPLETED, hiện tại: ${transaction.status}`);
      }
      const existing = await tx.approval_requests.findFirst({
        where: { entity_type: TRANSACTION_ADJUSTMENT, entity_id: id, status: 'PENDING' },
      });
      if (existing) throw new BadRequestException('Giao dịch đã có phiếu điều chỉnh đang chờ duyệt');

      const request = await tx.approval_requests.create({
        data: {
          entity_type: TRANSACTION_ADJUSTMENT,
          entity_id: id,
          requested_by_user_id: req.user.id,
          note: `${dto.reason.trim()}${dto.proposedCorrection ? `\nĐề xuất: ${dto.proposedCorrection.trim()}` : ''}`,
          approval_steps: { create: [{ step_no: 1, required_role_code: UserRole.MANAGER }] },
          approval_actions: { create: [{ action: 'SUBMIT', acted_by_user_id: req.user.id, note: dto.reason.trim() }] },
        },
        include: { approval_steps: true },
      });
      await this.notifications.notifyUsers({
        title: 'Phiếu điều chỉnh giao dịch chờ duyệt',
        body: `${transaction.transaction_no} · ${transaction.shifts?.shift_code ?? 'không có ca'} · ${dto.reason.trim()}`,
        sourceType: 'TRANSACTION_ADJUSTMENT_REQUEST',
        sourceId: request.id,
      }, {
        roles: ['ADMIN', 'MANAGER'],
        excludeUserIds: [req.user.id],
      }, tx);
      return request;
    });
  }

  @Post(':id/void')
  @Roles(UserRole.ADMIN, UserRole.MANAGER)
  async voidTransaction(@Request() req: any, @Param('id') id: string, @Body() dto: VoidTransactionDto) {
    return this.voidPostedTransaction(id, req.user.id, dto.reason, 'VOID_TRANSACTION');
  }

  @Post(':id/deactivate')
  @Roles(UserRole.ADMIN, UserRole.MANAGER)
  async deactivateTransaction(@Request() req: any, @Param('id') id: string, @Body() dto: VoidTransactionDto) {
    return this.voidPostedTransaction(id, req.user.id, dto.reason, 'DEACTIVATE_TRANSACTION');
  }

  @Post('adjustment-requests/:requestId/approve')
  @Roles(UserRole.ADMIN, UserRole.MANAGER)
  async approveAdjustmentRequest(
    @Request() req: any,
    @Param('requestId') requestId: string,
    @Body() dto: VoidTransactionDto,
  ) {
    return this.prisma.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT id FROM approval_requests WHERE id = ${requestId}::uuid FOR UPDATE`;
      const request = await tx.approval_requests.findUnique({ where: { id: requestId } });
      if (!request || request.entity_type !== TRANSACTION_ADJUSTMENT) {
        throw new BadRequestException('Không tìm thấy phiếu điều chỉnh giao dịch');
      }
      if (request.status !== 'PENDING') {
        throw new BadRequestException(`Phiếu đã ở trạng thái ${request.status}`);
      }
      if (request.requested_by_user_id === req.user.id) {
        throw new ForbiddenException('Người lập phiếu không được tự duyệt phiếu điều chỉnh của mình');
      }

      const transaction = await tx.customer_transactions.findUnique({
        where: { id: request.entity_id },
        include: { shifts: { select: { id: true, status: true } } },
      });
      if (!transaction) throw new BadRequestException('Không tìm thấy giao dịch gốc');
      const postingShift = transaction.shifts?.status === 'OPEN'
        ? transaction.shifts
        : await tx.shifts.findFirst({
            where: { branch_id: transaction.branch_id, status: 'OPEN' },
            orderBy: { opened_at: 'desc' },
            select: { id: true, status: true },
          });
      if (!postingShift) {
        throw new BadRequestException('Chi nhánh phải mở ca và kiểm quỹ đầu ca trước khi duyệt phiếu điều chỉnh');
      }

      const result = await this.voidPostedTransactionInTx(
        tx,
        request.entity_id,
        req.user.id,
        dto.reason?.trim() || request.note || 'Duyệt phiếu điều chỉnh giao dịch',
        'APPROVE_TRANSACTION_ADJUSTMENT',
        { postingShiftId: postingShift.id, approvalRequestId: request.id },
      );
      const claimed = await tx.approval_requests.updateMany({
        where: { id: request.id, status: 'PENDING' },
        data: { status: 'APPROVED', completed_at: new Date() },
      });
      if (claimed.count !== 1) throw new BadRequestException('Phiếu đã được xử lý bởi yêu cầu khác');
      const step = await tx.approval_steps.findFirst({
        where: { approval_request_id: request.id, status: 'PENDING' },
        orderBy: { step_no: 'asc' },
      });
      await tx.approval_steps.updateMany({
        where: { approval_request_id: request.id, status: 'PENDING' },
        data: { status: 'APPROVED', acted_by_user_id: req.user.id, acted_at: new Date(), note: dto.reason ?? null },
      });
      await tx.approval_actions.create({
        data: {
          approval_request_id: request.id,
          approval_step_id: step?.id ?? null,
          action: 'APPROVE',
          acted_by_user_id: req.user.id,
          note: dto.reason ?? null,
        },
      });
      await this.notifications.notifyUsers({
        title: 'Phiếu điều chỉnh giao dịch đã được duyệt',
        body: `${transaction.transaction_no} đã được đảo quỹ và công nợ trong ca hiện tại.`,
        sourceType: 'TRANSACTION_ADJUSTMENT_APPROVED',
        sourceId: request.id,
      }, { userIds: [request.requested_by_user_id] }, tx);
      return { approvalRequestId: request.id, status: 'APPROVED', transaction: result };
    });
  }

  @Post('adjustment-requests/:requestId/reject')
  @Roles(UserRole.ADMIN, UserRole.MANAGER)
  async rejectAdjustmentRequest(
    @Request() req: any,
    @Param('requestId') requestId: string,
    @Body() dto: VoidTransactionDto,
  ) {
    if (!dto.reason?.trim()) throw new BadRequestException('Vui lòng nhập lý do từ chối');
    return this.prisma.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT id FROM approval_requests WHERE id = ${requestId}::uuid FOR UPDATE`;
      const request = await tx.approval_requests.findUnique({ where: { id: requestId } });
      if (!request || request.entity_type !== TRANSACTION_ADJUSTMENT) {
        throw new BadRequestException('Không tìm thấy phiếu điều chỉnh giao dịch');
      }
      if (request.status !== 'PENDING') {
        throw new BadRequestException(`Phiếu đã ở trạng thái ${request.status}`);
      }
      const claimed = await tx.approval_requests.updateMany({
        where: { id: request.id, status: 'PENDING' },
        data: { status: 'REJECTED', completed_at: new Date() },
      });
      if (claimed.count !== 1) throw new BadRequestException('Phiếu đã được xử lý bởi yêu cầu khác');
      const step = await tx.approval_steps.findFirst({
        where: { approval_request_id: request.id, status: 'PENDING' },
        orderBy: { step_no: 'asc' },
      });
      await tx.approval_steps.updateMany({
        where: { approval_request_id: request.id, status: 'PENDING' },
        data: { status: 'REJECTED', acted_by_user_id: req.user.id, acted_at: new Date(), note: dto.reason.trim() },
      });
      await tx.approval_actions.create({
        data: {
          approval_request_id: request.id,
          approval_step_id: step?.id ?? null,
          action: 'REJECT',
          acted_by_user_id: req.user.id,
          note: dto.reason.trim(),
        },
      });
      await this.notifications.notifyUsers({
        title: 'Phiếu điều chỉnh giao dịch bị từ chối',
        body: dto.reason.trim(),
        sourceType: 'TRANSACTION_ADJUSTMENT_REJECTED',
        sourceId: request.id,
      }, { userIds: [request.requested_by_user_id] }, tx);
      return { approvalRequestId: request.id, status: 'REJECTED' };
    });
  }

  @Patch(':id/metadata')
  @Roles(UserRole.ADMIN, UserRole.MANAGER)
  async updateMetadata(
    @Request() req: any,
    @Param('id') id: string,
    @Body() dto: UpdateTransactionMetadataDto,
  ) {
    if (!dto.reason?.trim()) throw new BadRequestException('Vui lòng nhập lý do sửa giao dịch');
    if (dto.customerName === undefined && dto.customerPhone === undefined) {
      throw new BadRequestException('Không có thông tin giao dịch cần cập nhật');
    }

    return this.prisma.$transaction(async (tx) => {
      const transaction = await tx.customer_transactions.findUnique({ where: { id } });
      if (!transaction) throw new BadRequestException('Không tìm thấy giao dịch');
      if (transaction.status !== 'COMPLETED') {
        throw new BadRequestException(`Chỉ sửa metadata giao dịch COMPLETED, hiện tại: ${transaction.status}`);
      }

      const before = {
        customerName: transaction.customer_name,
        customerPhone: transaction.customer_phone,
      };
      const updated = await tx.customer_transactions.update({
        where: { id },
        data: {
          ...(dto.customerName !== undefined && { customer_name: dto.customerName.trim() || null }),
          ...(dto.customerPhone !== undefined && { customer_phone: dto.customerPhone.trim() || null }),
          updated_at: new Date(),
        },
      });
      const after = {
        customerName: updated.customer_name,
        customerPhone: updated.customer_phone,
      };

      await tx.audit_logs.create({
        data: {
          user_id: req.user.id,
          action: 'UPDATE_TRANSACTION_METADATA',
          entity_type: 'CUSTOMER_TRANSACTION',
          entity_id: id,
          before_data: before,
          after_data: { ...after, reason: dto.reason.trim() },
        },
      });

      return {
        id: updated.id,
        customerName: updated.customer_name,
        customerPhone: updated.customer_phone,
        status: updated.status,
        updatedAt: updated.updated_at,
      };
    });
  }

  private async voidPostedTransaction(
    transactionId: string,
    userId: string,
    reason: string,
    auditAction: string,
  ) {
    if (!reason?.trim()) throw new BadRequestException('Vui lòng nhập lý do void/deactivate giao dịch');
    return this.prisma.$transaction((tx) => (
      this.voidPostedTransactionInTx(tx, transactionId, userId, reason, auditAction)
    ));
  }

  private async voidPostedTransactionInTx(
    tx: Prisma.TransactionClient,
    transactionId: string,
    userId: string,
    reason: string,
    auditAction: string,
    options?: { postingShiftId?: string; approvalRequestId?: string },
  ) {
      if (!reason?.trim()) throw new BadRequestException('Vui lòng nhập lý do void/deactivate giao dịch');
      const now = new Date();
      const businessDate = toVietnamBusinessDate(now);
      await tx.$queryRaw`SELECT id FROM customer_transactions WHERE id = ${transactionId}::uuid FOR UPDATE`;
      const txn = await tx.customer_transactions.findUnique({ where: { id: transactionId } });
      if (!txn) throw new BadRequestException('Không tìm thấy giao dịch');
      if (txn.status !== 'COMPLETED') {
        throw new BadRequestException(`Chỉ void giao dịch COMPLETED, hiện tại: ${txn.status}`);
      }

      let postingShiftId = txn.shift_id;
      if (options?.postingShiftId) {
        await tx.$queryRaw`SELECT id FROM shifts WHERE id = ${options.postingShiftId}::uuid FOR SHARE`;
        const postingShift = await tx.shifts.findUnique({
          where: { id: options.postingShiftId },
          select: { id: true, branch_id: true, status: true, shift_code: true },
        });
        if (!postingShift || postingShift.branch_id !== txn.branch_id || postingShift.status !== 'OPEN') {
          throw new BadRequestException('Ca ghi nhận phiếu điều chỉnh không còn mở hoặc không thuộc chi nhánh giao dịch');
        }
        postingShiftId = postingShift.id;
      } else if (txn.shift_id) {
        const originalShift = await tx.shifts.findUnique({
          where: { id: txn.shift_id },
          select: { status: true, shift_code: true },
        });
        if (originalShift?.status !== 'OPEN') {
          throw new BadRequestException(
            `Không thể void giao dịch thuộc ca đã đóng (${originalShift?.shift_code ?? txn.shift_id}). Hãy lập phiếu điều chỉnh.`,
          );
        }
      }

      const debtMovements = await tx.debt_movements.findMany({
        where: {
          source_type: 'CUSTOMER_TRANSACTION',
          source_id: transactionId,
          status: 'POSTED',
          movement_type: { in: ['EXPECTED_DEBT', 'ACTUAL_DEBT'] },
        },
      });
      const debtAccountIds = [...new Set(debtMovements.map((debt) => debt.debt_account_id))].sort();
      for (const debtAccountId of debtAccountIds) {
        await tx.$queryRaw`SELECT id FROM debt_accounts WHERE id = ${debtAccountId}::uuid FOR UPDATE`;
      }

      if (debtAccountIds.length > 0) {
        const journalizedDebt = await tx.debt_movements.findFirst({
          where: {
            debt_account_id: { in: debtAccountIds },
            status: 'POSTED',
            OR: [
              { movement_type: 'ACTUAL_DEBT', source_type: 'JOURNAL_RECONCILIATION' },
              { movement_type: 'REVERSAL', source_type: 'JOURNAL_RECONCILIATION' },
              {
                movement_type: 'REVERSAL',
                source_type: 'DEBT_MOVEMENT',
                source_id: { in: debtMovements.map((debt) => debt.id) },
              },
            ],
          },
          select: { id: true },
        });
        if (journalizedDebt) {
          throw new BadRequestException(
            'Không thể void giao dịch sau khi công nợ ngày đã được chốt Journal. Hãy lập điều chỉnh đối chiếu.',
          );
        }
      }

      for (const debt of debtMovements) {
        const allocated = await tx.debt_settlement_allocations.aggregate({
          where: { debt_movement_id: debt.id },
          _sum: { amount: true },
        });
        const settledAmount = Number(allocated._sum.amount ?? 0);
        if (settledAmount > 0) {
          throw new BadRequestException(
            `Không thể void vì công nợ của giao dịch đã được giải quyết ${settledAmount} ${debt.currency_code}`,
          );
        }
      }

      const claimed = await tx.customer_transactions.updateMany({
        where: { id: transactionId, status: 'COMPLETED' },
        data: {
          status: 'VOIDED',
          voided_by_user_id: userId,
          void_reason: reason.trim(),
          voided_at: now,
        },
      });
      if (claimed.count !== 1) throw new BadRequestException('Giao dịch đã được xử lý bởi người khác');

      const postedEntries = await tx.ledger_entries.findMany({
        where: {
          source_type: 'CUSTOMER_TRANSACTION',
          source_id: transactionId,
          status: 'POSTED',
          reversed_entry_id: null,
        },
        include: { ledger_lines: true },
      });

      for (const entry of postedEntries) {
        await tx.ledger_entries.create({
          data: {
            entry_no: `REV-${entry.id}`,
            business_date: businessDate,
            branch_id: entry.branch_id,
            shift_id: postingShiftId,
            source_type: 'CUSTOMER_TRANSACTION',
            source_id: transactionId,
            status: 'POSTED',
            posted_at: now,
            description: `${options?.approvalRequestId ? 'Phiếu điều chỉnh' : 'Đảo bút toán'} giao dịch ${txn.transaction_no}: ${reason}`,
            created_by_user_id: userId,
            reversed_entry_id: entry.id,
            ledger_lines: {
              create: entry.ledger_lines.map((line: any) => ({
                fund_account_id: line.fund_account_id,
                direction: line.direction === 'DEBIT' ? 'CREDIT' : 'DEBIT',
                amount: line.amount,
                currency_code: line.currency_code,
                exchange_rate: line.exchange_rate,
                base_amount_vnd: line.base_amount_vnd,
              })),
            },
          },
        });
      }

      for (const debt of debtMovements) {
        await tx.debt_movements.create({
          data: {
            debt_account_id: debt.debt_account_id,
            branch_id: debt.branch_id,
            movement_type: 'REVERSAL',
            source_type: 'DEBT_MOVEMENT',
            source_id: debt.id,
            business_date: businessDate,
            amount: debt.amount,
            currency_code: debt.currency_code,
            status: 'POSTED',
            posted_at: now,
            description: `Đảo công nợ do void giao dịch ${txn.transaction_no}: ${reason}`,
            created_by_user_id: userId,
          },
        });
      }

      const updated = await tx.customer_transactions.findUniqueOrThrow({ where: { id: transactionId } });

      await tx.audit_logs.create({
        data: {
          user_id: userId,
          action: auditAction,
          entity_type: 'CUSTOMER_TRANSACTION',
          entity_id: transactionId,
          before_data: { status: txn.status },
          after_data: {
            status: updated.status,
            reason: reason.trim(),
            originalShiftId: txn.shift_id,
            postingShiftId,
            approvalRequestId: options?.approvalRequestId ?? null,
          },
        },
      });

      return updated;
  }
}
