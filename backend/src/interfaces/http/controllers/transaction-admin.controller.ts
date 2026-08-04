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
  RequestTransactionChangeDto,
  UpdateTransactionMetadataDto,
  VoidTransactionDto,
} from '../../../application/dtos/transactions/transaction-admin.dto';

@Controller('transactions')
@UseGuards(JwtAuthGuard, RolesGuard)
export class TransactionAdminController {
  constructor(private readonly prisma: PrismaService) {}

  @Get('change-requests')
  @Roles(UserRole.ADMIN, UserRole.MANAGER)
  async listChangeRequests(@Query('status') status?: string) {
    return this.prisma.approval_requests.findMany({
      where: {
        entity_type: 'CUSTOMER_TRANSACTION_VOID',
        ...(status && { status: status as any }),
      },
      include: {
        approval_steps: true,
        approval_actions: true,
        users: {
          include: { employees: true, user_roles: { include: { roles: true } } },
        },
      },
      orderBy: { requested_at: 'desc' },
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

  @Post(':id/change-requests')
  @Roles(UserRole.STAFF)
  async requestChange(@Request() req: any, @Param('id') id: string, @Body() dto: RequestTransactionChangeDto) {
    return this.prisma.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT id FROM customer_transactions WHERE id = ${id}::uuid FOR UPDATE`;
      const txn = await tx.customer_transactions.findUnique({ where: { id } });
      if (!txn) throw new BadRequestException('Không tìm thấy giao dịch');
      if (txn.branch_id !== req.user.branchId) {
        throw new ForbiddenException('Nhân viên chỉ được yêu cầu sửa giao dịch của chi nhánh mình');
      }
      if (txn.status !== 'COMPLETED') {
        throw new BadRequestException(`Chỉ yêu cầu sửa giao dịch COMPLETED, hiện tại: ${txn.status}`);
      }
      const existingRequest = await tx.approval_requests.findFirst({
        where: { entity_type: 'CUSTOMER_TRANSACTION_VOID', entity_id: id, status: 'PENDING' },
      });
      if (existingRequest) {
        throw new BadRequestException('Giao dịch đã có yêu cầu sửa/void đang chờ duyệt');
      }

      return tx.approval_requests.create({
        data: {
          entity_type: 'CUSTOMER_TRANSACTION_VOID',
          entity_id: id,
          requested_by_user_id: req.user.id,
          note: `${dto.reason}${dto.proposedCorrection ? `\nĐề xuất: ${dto.proposedCorrection}` : ''}`,
          approval_steps: {
            create: [{ step_no: 1, required_role_code: UserRole.MANAGER }],
          },
          approval_actions: {
            create: [{ action: 'SUBMIT', acted_by_user_id: req.user.id, note: dto.reason }],
          },
        },
        include: { approval_steps: true },
      });
    });
  }

  @Post('change-requests/:requestId/approve')
  @Roles(UserRole.ADMIN, UserRole.MANAGER)
  async approveChangeRequest(@Request() req: any, @Param('requestId') requestId: string, @Body() dto: VoidTransactionDto) {
    return this.prisma.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT id FROM approval_requests WHERE id = ${requestId}::uuid FOR UPDATE`;
      const request = await tx.approval_requests.findUnique({ where: { id: requestId } });
      if (!request) throw new BadRequestException('Không tìm thấy yêu cầu duyệt');
      if (request.entity_type !== 'CUSTOMER_TRANSACTION_VOID') {
        throw new BadRequestException('Yêu cầu duyệt không thuộc loại sửa/void giao dịch');
      }
      if (request.status !== 'PENDING') {
        throw new BadRequestException(`Yêu cầu đã ở trạng thái ${request.status}`);
      }

      const result = await this.voidPostedTransactionInTx(
        tx,
        request.entity_id,
        req.user.id,
        dto.reason || request.note || 'Duyệt void giao dịch',
        'APPROVE_VOID_TRANSACTION',
      );
      const claimed = await tx.approval_requests.updateMany({
        where: { id: request.id, status: 'PENDING' },
        data: { status: 'APPROVED', completed_at: new Date() },
      });
      if (claimed.count !== 1) throw new BadRequestException('Yêu cầu đã được xử lý bởi người khác');
      await tx.approval_steps.updateMany({
        where: { approval_request_id: request.id, status: 'PENDING' },
        data: { status: 'APPROVED', acted_by_user_id: req.user.id, acted_at: new Date(), note: dto.reason ?? null },
      });
      await tx.approval_actions.create({
        data: { approval_request_id: request.id, action: 'APPROVE', acted_by_user_id: req.user.id, note: dto.reason ?? null },
      });
      return { approvalRequestId: request.id, transaction: result };
    });
  }

  @Post('change-requests/:requestId/reject')
  @Roles(UserRole.ADMIN, UserRole.MANAGER)
  async rejectChangeRequest(@Request() req: any, @Param('requestId') requestId: string, @Body() dto: VoidTransactionDto) {
    if (!dto.reason?.trim()) throw new BadRequestException('Vui lòng nhập lý do từ chối');
    return this.prisma.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT id FROM approval_requests WHERE id = ${requestId}::uuid FOR UPDATE`;
      const request = await tx.approval_requests.findUnique({ where: { id: requestId } });
      if (!request) throw new BadRequestException('Không tìm thấy yêu cầu duyệt');
      if (request.entity_type !== 'CUSTOMER_TRANSACTION_VOID') {
        throw new BadRequestException('Yêu cầu duyệt không thuộc loại sửa/void giao dịch');
      }
      if (request.status !== 'PENDING') {
        throw new BadRequestException(`Yêu cầu đã ở trạng thái ${request.status}`);
      }

      const claimed = await tx.approval_requests.updateMany({
        where: { id: request.id, status: 'PENDING' },
        data: { status: 'REJECTED', completed_at: new Date() },
      });
      if (claimed.count !== 1) throw new BadRequestException('Yêu cầu đã được xử lý bởi người khác');
      await tx.approval_steps.updateMany({
        where: { approval_request_id: request.id, status: 'PENDING' },
        data: { status: 'REJECTED', acted_by_user_id: req.user.id, acted_at: new Date(), note: dto.reason },
      });
      await tx.approval_actions.create({
        data: { approval_request_id: request.id, action: 'REJECT', acted_by_user_id: req.user.id, note: dto.reason },
      });
      return { approvalRequestId: request.id, status: 'REJECTED' };
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
            shift_id: entry.shift_id,
            source_type: 'CUSTOMER_TRANSACTION',
            source_id: transactionId,
            status: 'POSTED',
            posted_at: now,
            description: `Đảo bút toán giao dịch ${txn.transaction_no}: ${reason}`,
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
          after_data: { status: updated.status, reason: reason.trim() },
        },
      });

      return updated;
  }
}
