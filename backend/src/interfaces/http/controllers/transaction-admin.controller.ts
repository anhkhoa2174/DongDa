import {
  BadRequestException, Body, Controller, ForbiddenException, Get, Param, Patch, Post, Query, Request, UseGuards,
} from '@nestjs/common';
import { randomUUID } from 'crypto';
import { PrismaService } from '../../../infrastructure/database/prisma.service';
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
    return this.voidPostedTransaction(id, req.user.id, dto.reason);
  }

  @Post(':id/deactivate')
  @Roles(UserRole.ADMIN, UserRole.MANAGER)
  async deactivateTransaction(@Request() req: any, @Param('id') id: string, @Body() dto: VoidTransactionDto) {
    return this.voidPostedTransaction(id, req.user.id, dto.reason);
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
    const txn = await this.prisma.customer_transactions.findUnique({ where: { id } });
    if (!txn) throw new BadRequestException('Không tìm thấy giao dịch');
    if (txn.branch_id !== req.user.branchId) {
      throw new ForbiddenException('Nhân viên chỉ được yêu cầu sửa giao dịch của chi nhánh mình');
    }
    if (txn.status !== 'COMPLETED') {
      throw new BadRequestException(`Chỉ yêu cầu sửa giao dịch COMPLETED, hiện tại: ${txn.status}`);
    }
    const existingRequest = await this.prisma.approval_requests.findFirst({
      where: { entity_type: 'CUSTOMER_TRANSACTION_VOID', entity_id: id },
    });
    if (existingRequest) {
      throw new BadRequestException(`Giao dịch đã có yêu cầu sửa/void ở trạng thái ${existingRequest.status}`);
    }

    const request = await this.prisma.approval_requests.create({
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

    return request;
  }

  @Post('change-requests/:requestId/approve')
  @Roles(UserRole.ADMIN, UserRole.MANAGER)
  async approveChangeRequest(@Request() req: any, @Param('requestId') requestId: string, @Body() dto: VoidTransactionDto) {
    const request = await this.prisma.approval_requests.findUnique({
      where: { id: requestId },
      include: { approval_steps: true },
    });
    if (!request) throw new BadRequestException('Không tìm thấy yêu cầu duyệt');
    if (request.entity_type !== 'CUSTOMER_TRANSACTION_VOID') {
      throw new BadRequestException('Yêu cầu duyệt không thuộc loại sửa/void giao dịch');
    }
    if (request.status !== 'PENDING') {
      throw new BadRequestException(`Yêu cầu đã ở trạng thái ${request.status}`);
    }

    const result = await this.voidPostedTransaction(request.entity_id, req.user.id, dto.reason || request.note || 'Duyệt void giao dịch');
    await this.prisma.$transaction(async (tx) => {
      await tx.approval_requests.update({
        where: { id: request.id },
        data: { status: 'APPROVED', completed_at: new Date() },
      });
      await tx.approval_steps.updateMany({
        where: { approval_request_id: request.id, status: 'PENDING' },
        data: { status: 'APPROVED', acted_by_user_id: req.user.id, acted_at: new Date(), note: dto.reason ?? null },
      });
      await tx.approval_actions.create({
        data: { approval_request_id: request.id, action: 'APPROVE', acted_by_user_id: req.user.id, note: dto.reason ?? null },
      });
    });

    return { approvalRequestId: request.id, transaction: result };
  }

  @Post('change-requests/:requestId/reject')
  @Roles(UserRole.ADMIN, UserRole.MANAGER)
  async rejectChangeRequest(@Request() req: any, @Param('requestId') requestId: string, @Body() dto: VoidTransactionDto) {
    if (!dto.reason?.trim()) throw new BadRequestException('Vui lòng nhập lý do từ chối');
    const request = await this.prisma.approval_requests.findUnique({ where: { id: requestId } });
    if (!request) throw new BadRequestException('Không tìm thấy yêu cầu duyệt');
    if (request.entity_type !== 'CUSTOMER_TRANSACTION_VOID') {
      throw new BadRequestException('Yêu cầu duyệt không thuộc loại sửa/void giao dịch');
    }
    if (request.status !== 'PENDING') {
      throw new BadRequestException(`Yêu cầu đã ở trạng thái ${request.status}`);
    }

    await this.prisma.$transaction(async (tx) => {
      await tx.approval_requests.update({
        where: { id: request.id },
        data: { status: 'REJECTED', completed_at: new Date(), note: request.note },
      });
      await tx.approval_steps.updateMany({
        where: { approval_request_id: request.id, status: 'PENDING' },
        data: { status: 'REJECTED', acted_by_user_id: req.user.id, acted_at: new Date(), note: dto.reason },
      });
      await tx.approval_actions.create({
        data: { approval_request_id: request.id, action: 'REJECT', acted_by_user_id: req.user.id, note: dto.reason },
      });
    });

    return { approvalRequestId: request.id, status: 'REJECTED' };
  }

  private async voidPostedTransaction(transactionId: string, userId: string, reason: string) {
    if (!reason?.trim()) throw new BadRequestException('Vui lòng nhập lý do void/deactivate giao dịch');
    const now = new Date();

    return this.prisma.$transaction(async (tx) => {
      const txn = await tx.customer_transactions.findUnique({ where: { id: transactionId } });
      if (!txn) throw new BadRequestException('Không tìm thấy giao dịch');
      if (txn.status !== 'COMPLETED') {
        throw new BadRequestException(`Chỉ void giao dịch COMPLETED, hiện tại: ${txn.status}`);
      }

      const postedEntries = await tx.ledger_entries.findMany({
        where: { source_type: 'CUSTOMER_TRANSACTION', source_id: transactionId, status: 'POSTED' },
        include: { ledger_lines: true },
      });

      for (const entry of postedEntries) {
        await tx.ledger_entries.create({
          data: {
            entry_no: `REV-${entry.entry_no}-${Date.now()}`,
            business_date: now,
            branch_id: entry.branch_id,
            shift_id: entry.shift_id,
            source_type: 'CASH_MOVEMENT',
            source_id: randomUUID(),
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
        where: { source_type: 'CUSTOMER_TRANSACTION', source_id: transactionId, status: 'POSTED' },
      });
      for (const debt of debtMovements) {
        const outstanding = await this.debtOutstanding(tx, debt.debt_account_id);
        if (Number(debt.amount) > outstanding) {
          throw new BadRequestException(
            `Không thể void vì công nợ đã được giải quyết một phần/toàn bộ. Còn nợ ${outstanding}, cần đảo ${debt.amount}`,
          );
        }
        await tx.debt_movements.create({
          data: {
            debt_account_id: debt.debt_account_id,
            branch_id: debt.branch_id,
            movement_type: 'SETTLEMENT',
            source_type: 'CUSTOMER_TRANSACTION',
            source_id: transactionId,
            business_date: now,
            amount: debt.amount,
            currency_code: debt.currency_code,
            status: 'POSTED',
            posted_at: now,
            description: `Đảo công nợ do void giao dịch ${txn.transaction_no}: ${reason}`,
            created_by_user_id: userId,
          },
        });
      }

      const updated = await tx.customer_transactions.update({
        where: { id: transactionId },
        data: {
          status: 'VOIDED',
          voided_by_user_id: userId,
          void_reason: reason,
          voided_at: now,
        },
      });

      await tx.audit_logs.create({
        data: {
          user_id: userId,
          action: 'DEACTIVATE_TRANSACTION',
          entity_type: 'CUSTOMER_TRANSACTION',
          entity_id: transactionId,
          before_data: { status: txn.status },
          after_data: { status: updated.status, reason: reason.trim() },
        },
      });

      return updated;
    });
  }

  private async debtOutstanding(tx: any, debtAccountId: string): Promise<number> {
    const grouped = await tx.debt_movements.groupBy({
      by: ['movement_type'],
      where: { debt_account_id: debtAccountId, status: 'POSTED' },
      _sum: { amount: true },
    });
    let debt = 0;
    let settled = 0;
    for (const g of grouped) {
      const amount = Number(g._sum.amount ?? 0);
      if (g.movement_type === 'EXPECTED_DEBT' || g.movement_type === 'ACTUAL_DEBT') debt += amount;
      else if (g.movement_type === 'SETTLEMENT') settled += amount;
    }
    return debt - settled;
  }
}
