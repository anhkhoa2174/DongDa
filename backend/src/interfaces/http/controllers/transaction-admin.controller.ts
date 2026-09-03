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
import { calculateFxVndAmount } from '../../../domain/entities/fx.entity';

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
        include: {
          shifts: { select: { status: true, shift_code: true } },
          wu_transaction_details: true,
          mg_transaction_details: true,
          fx_transaction_details: true,
        },
      });
      if (!transaction) throw new BadRequestException('Không tìm thấy giao dịch');
      if (req.user.role === UserRole.STAFF && transaction.branch_id !== req.user.branchId) {
        throw new ForbiddenException('Nhân viên chỉ được lập phiếu cho giao dịch của chi nhánh mình');
      }
      if (transaction.status !== 'COMPLETED') {
        throw new BadRequestException(`Chỉ lập phiếu cho giao dịch COMPLETED, hiện tại: ${transaction.status}`);
      }
      await this.assertTransactionNotReconciled(tx, transaction.id);
      const existing = await tx.approval_requests.findFirst({
        where: { entity_type: TRANSACTION_ADJUSTMENT, entity_id: id, status: 'PENDING' },
      });
      if (existing) throw new BadRequestException('Giao dịch đã có phiếu điều chỉnh đang chờ duyệt');

      const payload = this.buildAdjustmentPayload(transaction, dto);

      const request = await tx.approval_requests.create({
        data: {
          entity_type: TRANSACTION_ADJUSTMENT,
          entity_id: id,
          requested_by_user_id: req.user.id,
          note: `${dto.reason.trim()}${dto.proposedCorrection ? `\nĐề xuất: ${dto.proposedCorrection.trim()}` : ''}`,
          payload: payload as Prisma.InputJsonValue,
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
  async voidDirectly(
    @Request() req: any,
    @Param('id') id: string,
    @Body() dto: VoidTransactionDto,
  ) {
    if (!dto.reason?.trim()) throw new BadRequestException('Vui lòng nhập lý do hủy giao dịch');

    return this.prisma.$transaction(async (tx) => {
      const transaction = await tx.customer_transactions.findUnique({
        where: { id },
        include: { shifts: { select: { id: true, status: true } } },
      });
      if (!transaction) throw new BadRequestException('Không tìm thấy giao dịch');

      const postingShift = transaction.shifts?.status === 'OPEN'
        ? transaction.shifts
        : await tx.shifts.findFirst({
            where: { branch_id: transaction.branch_id, status: 'OPEN' },
            orderBy: { opened_at: 'desc' },
            select: { id: true, status: true },
          });
      if (!postingShift) {
        throw new BadRequestException('Chi nhánh phải mở ca và kiểm quỹ đầu ca trước khi hủy giao dịch');
      }

      const voidedTransaction = await this.voidPostedTransactionInTx(
        tx,
        id,
        req.user.id,
        dto.reason.trim(),
        'DIRECT_VOID_TRANSACTION',
        { postingShiftId: postingShift.id },
      );

      const pendingRequests = await tx.approval_requests.findMany({
        where: { entity_type: TRANSACTION_ADJUSTMENT, entity_id: id, status: 'PENDING' },
        select: { id: true, requested_by_user_id: true },
      });
      const pendingRequestIds = pendingRequests.map((request) => request.id);
      if (pendingRequestIds.length > 0) {
        const completedAt = new Date();
        await tx.approval_requests.updateMany({
          where: { id: { in: pendingRequestIds }, status: 'PENDING' },
          data: { status: 'CANCELLED', completed_at: completedAt },
        });
        await tx.approval_steps.updateMany({
          where: { approval_request_id: { in: pendingRequestIds }, status: 'PENDING' },
          data: {
            status: 'CANCELLED',
            acted_by_user_id: req.user.id,
            acted_at: completedAt,
            note: `Giao dịch đã được hủy trực tiếp: ${dto.reason.trim()}`,
          },
        });
        await tx.approval_actions.createMany({
          data: pendingRequestIds.map((requestId) => ({
            approval_request_id: requestId,
            action: 'CANCEL' as const,
            acted_by_user_id: req.user.id,
            note: `Giao dịch đã được hủy trực tiếp: ${dto.reason.trim()}`,
          })),
        });
      }

      const recipientUserIds = [
        transaction.created_by_user_id,
        ...pendingRequests.map((request) => request.requested_by_user_id),
      ];
      await this.notifications.notifyUsers({
        title: 'Giao dịch đã được hủy trực tiếp',
        body: `${transaction.transaction_no} · ${dto.reason.trim()}`,
        sourceType: 'TRANSACTION_VOIDED',
        sourceId: transaction.id,
      }, {
        userIds: recipientUserIds,
        excludeUserIds: [req.user.id],
      }, tx);

      return voidedTransaction;
    });
  }

  @Post(':id/replace')
  @Roles(UserRole.ADMIN, UserRole.MANAGER)
  async replaceDirectly(
    @Request() req: any,
    @Param('id') id: string,
    @Body() dto: CreateTransactionAdjustmentDto,
  ) {
    if (dto.action !== 'REPLACE') {
      throw new BadRequestException('API thay thế trực tiếp chỉ chấp nhận action REPLACE');
    }
    if (!dto.reason?.trim()) throw new BadRequestException('Vui lòng nhập lý do thay thế giao dịch');

    return this.prisma.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT id FROM customer_transactions WHERE id = ${id}::uuid FOR UPDATE`;
      const transaction = await tx.customer_transactions.findUnique({
        where: { id },
        include: {
          shifts: { select: { id: true, status: true } },
          wu_transaction_details: true,
          mg_transaction_details: true,
          fx_transaction_details: true,
        },
      });
      if (!transaction) throw new BadRequestException('Không tìm thấy giao dịch');
      if (transaction.status !== 'COMPLETED') {
        throw new BadRequestException(`Chỉ thay thế giao dịch COMPLETED, hiện tại: ${transaction.status}`);
      }
      await this.assertTransactionNotReconciled(tx, transaction.id);

      const postingShift = transaction.shifts?.status === 'OPEN'
        ? transaction.shifts
        : await tx.shifts.findFirst({
            where: { branch_id: transaction.branch_id, status: 'OPEN' },
            orderBy: { opened_at: 'desc' },
            select: { id: true, status: true },
          });
      if (!postingShift) {
        throw new BadRequestException('Chi nhánh phải mở ca và kiểm quỹ đầu ca trước khi thay thế giao dịch');
      }

      const payload = this.buildAdjustmentPayload(transaction, dto);
      const voidedTransaction = await this.voidPostedTransactionInTx(
        tx,
        id,
        req.user.id,
        dto.reason.trim(),
        'DIRECT_REPLACE_TRANSACTION',
        { postingShiftId: postingShift.id },
      );
      const replacementTransaction = await this.createReplacementTransactionInTx(
        tx,
        id,
        postingShift.id,
        req.user.id,
        (payload as { correctedData: Record<string, unknown> }).correctedData,
        'DIRECT_REPLACEMENT',
      );

      const pendingRequests = await tx.approval_requests.findMany({
        where: { entity_type: TRANSACTION_ADJUSTMENT, entity_id: id, status: 'PENDING' },
        select: { id: true, requested_by_user_id: true },
      });
      const pendingRequestIds = pendingRequests.map((request) => request.id);
      if (pendingRequestIds.length > 0) {
        const completedAt = new Date();
        await tx.approval_requests.updateMany({
          where: { id: { in: pendingRequestIds }, status: 'PENDING' },
          data: { status: 'CANCELLED', completed_at: completedAt },
        });
        await tx.approval_steps.updateMany({
          where: { approval_request_id: { in: pendingRequestIds }, status: 'PENDING' },
          data: {
            status: 'CANCELLED',
            acted_by_user_id: req.user.id,
            acted_at: completedAt,
            note: `Giao dịch đã được thay thế trực tiếp: ${dto.reason.trim()}`,
          },
        });
        await tx.approval_actions.createMany({
          data: pendingRequestIds.map((requestId) => ({
            approval_request_id: requestId,
            action: 'CANCEL' as const,
            acted_by_user_id: req.user.id,
            note: `Giao dịch đã được thay thế trực tiếp: ${dto.reason.trim()}`,
          })),
        });
      }

      await this.notifications.notifyUsers({
        title: 'Giao dịch đã được thay thế',
        body: `${transaction.transaction_no} đã được đảo và thay thế bằng ${replacementTransaction.transaction_no}.`,
        sourceType: 'TRANSACTION_REPLACED',
        sourceId: replacementTransaction.id,
      }, {
        userIds: [transaction.created_by_user_id, ...pendingRequests.map((request) => request.requested_by_user_id)],
        excludeUserIds: [req.user.id],
      }, tx);

      return { transaction: voidedTransaction, replacementTransaction };
    });
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

      const payload = (request.payload ?? {}) as Record<string, any>;
      const action = payload.action === 'REPLACE' ? 'REPLACE' : 'VOID';
      const voidedTransaction = await this.voidPostedTransactionInTx(
        tx,
        request.entity_id,
        req.user.id,
        dto.reason?.trim() || request.note || 'Duyệt phiếu điều chỉnh giao dịch',
        'APPROVE_TRANSACTION_ADJUSTMENT',
        { postingShiftId: postingShift.id, approvalRequestId: request.id },
      );
      const replacementTransaction = action === 'REPLACE'
        ? await this.createReplacementTransactionInTx(
            tx,
            request.entity_id,
            postingShift.id,
            req.user.id,
            payload.correctedData as Record<string, unknown>,
            request.id,
          )
        : null;
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
        body: replacementTransaction
          ? `${transaction.transaction_no} đã được đảo và thay thế bằng ${replacementTransaction.transaction_no}.`
          : `${transaction.transaction_no} đã được hủy và đảo quỹ/công nợ trong ca hiện tại.`,
        sourceType: 'TRANSACTION_ADJUSTMENT_APPROVED',
        sourceId: request.id,
      }, { userIds: [request.requested_by_user_id] }, tx);
      return {
        approvalRequestId: request.id,
        status: 'APPROVED',
        transaction: voidedTransaction,
        replacementTransaction,
      };
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
      await tx.$queryRaw`SELECT id FROM customer_transactions WHERE id = ${id}::uuid FOR UPDATE`;
      const transaction = await tx.customer_transactions.findUnique({ where: { id } });
      if (!transaction) throw new BadRequestException('Không tìm thấy giao dịch');
      if (transaction.status !== 'COMPLETED') {
        throw new BadRequestException(`Chỉ sửa metadata giao dịch COMPLETED, hiện tại: ${transaction.status}`);
      }
      await this.assertTransactionNotReconciled(tx, transaction.id);

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

  private buildAdjustmentPayload(transaction: any, dto: CreateTransactionAdjustmentDto) {
    if (dto.action === 'VOID') return { action: 'VOID' };
    const corrected = dto.correctedData ?? {};
    const positive = (field: string) => {
      const value = Number(corrected[field]);
      if (!Number.isFinite(value) || value <= 0) {
        throw new BadRequestException(`${field} phải là số dương hợp lệ`);
      }
      if (Math.abs(value * 100 - Math.round(value * 100)) > 1e-8) {
        throw new BadRequestException(`${field} chỉ được có tối đa 2 chữ số thập phân`);
      }
      return value;
    };

    if (transaction.operation_code === 'WU') {
      const wuUsdAmount = positive('wuUsdAmount');
      const wuVndAmount = positive('wuVndAmount');
      if (!Number.isInteger(wuVndAmount)) throw new BadRequestException('Amount VND của WU phải là số nguyên');
      return { action: 'REPLACE', correctedData: { wuUsdAmount, wuVndAmount } };
    }
    if (transaction.operation_code === 'MG') {
      const paidAmount = positive('paidAmount');
      if (transaction.mg_transaction_details?.paid_currency === 'VND' && !Number.isInteger(paidAmount)) {
        throw new BadRequestException('Amount VND của MG phải là số nguyên');
      }
      return { action: 'REPLACE', correctedData: { paidAmount } };
    }
    if (transaction.operation_code === 'FX') {
      return { action: 'REPLACE', correctedData: { fxAmount: positive('fxAmount') } };
    }
    throw new BadRequestException(`Chưa hỗ trợ thay thế giao dịch ${transaction.operation_code}`);
  }

  private async assertTransactionNotReconciled(tx: Prisma.TransactionClient, transactionId: string) {
    const debt = await tx.debt_accounts.findUnique({
      where: { transaction_id: transactionId },
      select: { id: true },
    });
    if (!debt) return;

    await tx.$queryRaw`SELECT id FROM debt_accounts WHERE id = ${debt.id}::uuid FOR UPDATE`;
    const lockedDebt = await tx.debt_accounts.findUnique({
      where: { id: debt.id },
      select: { lifecycle_status: true },
    });
    if (lockedDebt && lockedDebt.lifecycle_status !== 'PENDING') {
      const settledMessage = lockedDebt.lifecycle_status === 'SETTLED'
        ? 'Công nợ của giao dịch đã được thanh toán'
        : 'Giao dịch đã được đối chiếu hoặc công nợ không còn PENDING';
      throw new BadRequestException(
        `${settledMessage} (${lockedDebt.lifecycle_status}); không được sửa, thay thế hoặc hủy`,
      );
    }
  }

  private async createReplacementTransactionInTx(
    tx: Prisma.TransactionClient,
    originalTransactionId: string,
    postingShiftId: string,
    userId: string,
    correctedData: Record<string, unknown>,
    approvalRequestId: string,
  ) {
    const now = new Date();
    const postingBusinessDate = toVietnamBusinessDate(now);
    const original = await tx.customer_transactions.findUnique({
      where: { id: originalTransactionId },
      include: {
        wu_transaction_details: true,
        mg_transaction_details: true,
        fx_transaction_details: true,
      },
    });
    if (!original || original.status !== 'VOIDED') {
      throw new BadRequestException('Giao dịch gốc chưa được đảo để tạo giao dịch thay thế');
    }

    const fundAccount = async (currency: string) => {
      const account = await tx.fund_accounts.findFirst({
        where: {
          branch_id: original.branch_id,
          currency_code: currency as any,
          status: 'ACTIVE',
          account_type: currency === 'VND' || currency === 'USD' ? 'CASH' : 'FUND_A',
        },
        select: { id: true },
      });
      if (!account) throw new BadRequestException(`Chi nhánh chưa có sổ quỹ ${currency}`);
      return account.id;
    };
    const balance = async (accountId: string) => {
      const lines = await tx.ledger_lines.findMany({
        where: { fund_account_id: accountId, ledger_entries: { status: 'POSTED' } },
        select: { direction: true, amount: true },
      });
      return lines.reduce((sum, line) => (
        sum + (line.direction === 'DEBIT' ? Number(line.amount) : -Number(line.amount))
      ), 0);
    };
    const lockAndCheckCredits = async (lines: Array<any>) => {
      const creditByAccount = new Map<string, { amount: number; currency: string }>();
      for (const line of lines.filter((item) => item.direction === 'CREDIT')) {
        const current = creditByAccount.get(line.fund_account_id) ?? { amount: 0, currency: line.currency_code };
        current.amount += Number(line.amount);
        creditByAccount.set(line.fund_account_id, current);
      }
      for (const accountId of [...new Set(lines.map((line) => line.fund_account_id))].sort()) {
        await tx.$queryRaw`SELECT id FROM fund_accounts WHERE id = ${accountId}::uuid FOR UPDATE`;
      }
      for (const [accountId, required] of creditByAccount) {
        const available = await balance(accountId);
        if (required.amount > available) {
          throw new BadRequestException(
            `Không đủ quỹ ${required.currency} để tạo giao dịch thay thế. Tồn ${available}, cần ${required.amount}`,
          );
        }
      }
    };
    const createDebt = async (
      transactionId: string, transactionNo: string, provider: 'WU' | 'MG',
      currency: 'USD' | 'VND', amount: number,
    ) => {
      const account = await tx.debt_accounts.create({
        data: {
          transaction_id: transactionId,
          branch_id: original.branch_id,
          provider_code: provider,
          currency_code: currency,
          business_date: original.business_date,
          name: `Công nợ ${provider} - ${transactionNo}`,
          lifecycle_status: 'PENDING',
        },
      });
      await tx.debt_movements.create({ data: {
        debt_account_id: account.id,
        branch_id: original.branch_id,
        movement_type: 'EXPECTED_DEBT',
        source_type: 'CUSTOMER_TRANSACTION',
        source_id: transactionId,
        business_date: original.business_date,
        amount,
        currency_code: currency,
        status: 'POSTED',
        posted_at: now,
        description: `Công nợ giao dịch thay thế cho ${original.transaction_no}`,
        created_by_user_id: userId,
      } });
    };
    const commonTransaction = {
      branch_id: original.branch_id,
      shift_id: postingShiftId,
      business_date: original.business_date,
      status: 'COMPLETED' as const,
      customer_id: original.customer_id,
      customer_name: original.customer_name,
      customer_phone: original.customer_phone,
      created_by_user_id: userId,
      replacement_of_transaction_id: original.id,
      revision: original.revision + 1,
    };

    let replacement: any;
    if (original.operation_code === 'WU' && original.wu_transaction_details) {
      const detail = original.wu_transaction_details;
      const wuUsdAmount = Number(correctedData.wuUsdAmount);
      const wuVndAmount = Number(correctedData.wuVndAmount);
      const rate = Number(detail.applied_rate);
      const payoutUsd = detail.payout_currency === 'USD';
      const receivedUsd = payoutUsd
        ? Math.min(Math.max(Math.trunc(Number(detail.received_usd)), 0), Math.trunc(wuUsdAmount))
        : 0;
      const receivedVnd = Math.round((wuUsdAmount - receivedUsd) * rate);
      replacement = await tx.customer_transactions.create({ data: {
        ...commonTransaction,
        transaction_no: `WU-R${commonTransaction.revision}-${Date.now()}-${Math.floor(Math.random() * 1000)}`,
        operation_code: 'WU', amount: wuUsdAmount, currency_code: 'USD', vnd_amount: wuVndAmount,
      } });
      await tx.wu_transaction_details.create({ data: {
        transaction_id: replacement.id,
        bank_account_id: detail.bank_account_id,
        mtcn: detail.mtcn,
        paid_currency: detail.paid_currency,
        payout_currency: detail.payout_currency,
        wu_usd_amount: wuUsdAmount,
        wu_vnd_amount: wuVndAmount,
        received_usd: receivedUsd,
        received_vnd: receivedVnd,
        wu_rate: wuVndAmount / wuUsdAmount,
        system_rate: detail.system_rate,
        applied_rate: detail.applied_rate,
      } });
      const lines: any[] = [];
      if (receivedUsd > 0) {
        const accountId = await fundAccount('USD');
        lines.push({ fund_account_id: accountId, direction: 'CREDIT', amount: receivedUsd,
          currency_code: 'USD', exchange_rate: rate, base_amount_vnd: Math.round(receivedUsd * rate) });
      }
      if (receivedVnd > 0) {
        const accountId = await fundAccount('VND');
        lines.push({ fund_account_id: accountId, direction: 'CREDIT', amount: receivedVnd,
          currency_code: 'VND', exchange_rate: 1, base_amount_vnd: receivedVnd });
      }
      await lockAndCheckCredits(lines);
      await tx.ledger_entries.create({ data: {
        entry_no: `WU-${replacement.transaction_no}`, business_date: postingBusinessDate,
        branch_id: original.branch_id, shift_id: postingShiftId,
        source_type: 'CUSTOMER_TRANSACTION', source_id: replacement.id,
        status: 'POSTED', posted_at: now,
        description: `WU thay thế ${original.transaction_no}`,
        created_by_user_id: userId, ledger_lines: { create: lines },
      } });
      const debtAmount = detail.paid_currency === 'USD' ? wuUsdAmount : wuVndAmount;
      await createDebt(replacement.id, replacement.transaction_no, 'WU', detail.paid_currency as 'USD' | 'VND', debtAmount);
    } else if (original.operation_code === 'MG' && original.mg_transaction_details) {
      const detail = original.mg_transaction_details;
      const paidAmount = Number(correctedData.paidAmount);
      const rate = Number(detail.applied_rate);
      const paidCurrency = detail.paid_currency as 'USD' | 'VND';
      const payoutCurrency = detail.payout_currency as 'USD' | 'VND';
      const mgUsdAmount = paidCurrency === 'USD' ? paidAmount : 0;
      const mgVndAmount = paidCurrency === 'VND' ? paidAmount : 0;
      const payoutAmount = payoutCurrency === 'USD'
        ? Number((paidCurrency === 'USD' ? paidAmount : paidAmount / rate).toFixed(2))
        : Math.round(paidCurrency === 'VND' ? paidAmount : paidAmount * rate);
      const receivedUsd = payoutCurrency === 'USD' ? Math.trunc(payoutAmount) : 0;
      const receivedVnd = payoutCurrency === 'USD'
        ? Math.round((payoutAmount - receivedUsd) * rate)
        : payoutAmount;
      replacement = await tx.customer_transactions.create({ data: {
        ...commonTransaction,
        transaction_no: `MG-R${commonTransaction.revision}-${Date.now()}-${Math.floor(Math.random() * 1000)}`,
        operation_code: 'MG', amount: mgUsdAmount, currency_code: 'USD', vnd_amount: mgVndAmount,
      } });
      await tx.mg_transaction_details.create({ data: {
        transaction_id: replacement.id,
        reference_no: detail.reference_no,
        payout_currency: payoutCurrency,
        paid_currency: paidCurrency,
        payout_amount: payoutAmount,
        received_usd: receivedUsd,
        received_vnd: receivedVnd,
        system_rate: detail.system_rate,
        applied_rate: detail.applied_rate,
      } });
      const lines: any[] = [];
      if (receivedUsd > 0) {
        const accountId = await fundAccount('USD');
        lines.push({ fund_account_id: accountId, direction: 'CREDIT', amount: receivedUsd,
          currency_code: 'USD', exchange_rate: rate, base_amount_vnd: Math.round(receivedUsd * rate) });
      }
      if (receivedVnd > 0) {
        const accountId = await fundAccount('VND');
        lines.push({ fund_account_id: accountId, direction: 'CREDIT', amount: receivedVnd,
          currency_code: 'VND', exchange_rate: 1, base_amount_vnd: receivedVnd });
      }
      await lockAndCheckCredits(lines);
      await tx.ledger_entries.create({ data: {
        entry_no: `MG-${replacement.transaction_no}`, business_date: postingBusinessDate,
        branch_id: original.branch_id, shift_id: postingShiftId,
        source_type: 'CUSTOMER_TRANSACTION', source_id: replacement.id,
        status: 'POSTED', posted_at: now,
        description: `MG thay thế ${original.transaction_no}`,
        created_by_user_id: userId, ledger_lines: { create: lines },
      } });
      await createDebt(replacement.id, replacement.transaction_no, 'MG', paidCurrency, paidAmount);
    } else if (original.operation_code === 'FX' && original.fx_transaction_details) {
      const detail = original.fx_transaction_details;
      const fxAmount = Number(correctedData.fxAmount);
      const rate = Number(detail.rate);
      const fractionalAmount = Number(detail.fractional_amount ?? 0);
      if (fxAmount <= fractionalAmount) {
        throw new BadRequestException('Tổng số lượng ngoại tệ phải lớn hơn phần lẻ đã ghi nhận');
      }
      const fractionalRate = detail.fractional_rate == null ? rate : Number(detail.fractional_rate);
      const deductionVnd = Number(detail.deduction_vnd ?? 0);
      const { vndAmount } = calculateFxVndAmount({
        fxAmount,
        fractionalAmount,
        rate,
        fractionalRate,
        deductionVnd,
      });
      if (vndAmount <= 0) {
        throw new BadRequestException('Khấu trừ phải nhỏ hơn thành tiền mua ngoại tệ');
      }
      const vndAccountId = await fundAccount('VND');
      const fxAccountId = await fundAccount(detail.fx_currency);
      const lines: any[] = [
        { fund_account_id: vndAccountId, direction: detail.is_buy ? 'CREDIT' : 'DEBIT', amount: vndAmount,
          currency_code: 'VND', exchange_rate: 1, base_amount_vnd: vndAmount },
        { fund_account_id: fxAccountId, direction: detail.is_buy ? 'DEBIT' : 'CREDIT', amount: fxAmount,
          currency_code: detail.fx_currency, exchange_rate: rate, base_amount_vnd: vndAmount },
      ];
      await lockAndCheckCredits(lines);
      replacement = await tx.customer_transactions.create({ data: {
        ...commonTransaction,
        transaction_no: `FX-R${commonTransaction.revision}-${Date.now()}-${Math.floor(Math.random() * 1000)}`,
        operation_code: 'FX', amount: fxAmount, currency_code: detail.fx_currency, vnd_amount: vndAmount,
      } });
      await tx.fx_transaction_details.create({ data: {
        transaction_id: replacement.id,
        fx_currency: detail.fx_currency,
        fx_amount: fxAmount,
        rate: detail.rate,
        is_buy: detail.is_buy,
        fractional_amount: fractionalAmount,
        fractional_rate: detail.fractional_rate,
        deduction_vnd: deductionVnd,
      } });
      await tx.ledger_entries.create({ data: {
        entry_no: `FX-${replacement.transaction_no}`, business_date: postingBusinessDate,
        branch_id: original.branch_id, shift_id: postingShiftId,
        source_type: 'CUSTOMER_TRANSACTION', source_id: replacement.id,
        status: 'POSTED', posted_at: now,
        description: `FX thay thế ${original.transaction_no}`,
        created_by_user_id: userId, ledger_lines: { create: lines },
      } });
    } else {
      throw new BadRequestException(`Chưa hỗ trợ thay thế giao dịch ${original.operation_code}`);
    }

    await tx.audit_logs.create({ data: {
      user_id: userId,
      action: 'CREATE_REPLACEMENT_TRANSACTION',
      entity_type: 'CUSTOMER_TRANSACTION',
      entity_id: replacement.id,
      before_data: { originalTransactionId: original.id, originalTransactionNo: original.transaction_no },
      after_data: {
        replacementTransactionId: replacement.id,
        replacementTransactionNo: replacement.transaction_no,
        revision: replacement.revision,
        approvalRequestId,
        ratePolicy: 'PRESERVE_ORIGINAL_SNAPSHOT',
        originalBusinessDate: original.business_date,
        postingBusinessDate,
      },
    } });
    return replacement;
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
      await this.assertTransactionNotReconciled(tx, txn.id);

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

      if (debtAccountIds.length > 0) {
        await tx.debt_accounts.updateMany({
          where: { id: { in: debtAccountIds }, lifecycle_status: 'PENDING' },
          data: {
            lifecycle_status: 'CANCELLED',
            cancelled_at: now,
            reconciliation_run_id: null,
            reconciled_at: null,
            updated_at: now,
          },
        });
      }

      const postedEntries = await tx.ledger_entries.findMany({
        where: {
          source_type: 'CUSTOMER_TRANSACTION',
          source_id: transactionId,
          status: 'POSTED',
          reversed_entry_id: null,
        },
        include: { ledger_lines: true },
      });
      const fundAccountIds = [...new Set(postedEntries.flatMap((entry) =>
        entry.ledger_lines.map((line) => line.fund_account_id),
      ))].sort();
      for (const fundAccountId of fundAccountIds) {
        await tx.$queryRaw`SELECT id FROM fund_accounts WHERE id = ${fundAccountId}::uuid FOR UPDATE`;
      }
      for (const fundAccountId of fundAccountIds) {
        const reduction = postedEntries.reduce((total, entry) => total + entry.ledger_lines
          .filter((line) => line.fund_account_id === fundAccountId && line.direction === 'DEBIT')
          .reduce((sum, line) => sum + Number(line.amount), 0), 0);
        if (reduction <= 0) continue;
        const balanceLines = await tx.ledger_lines.findMany({
          where: { fund_account_id: fundAccountId, ledger_entries: { status: 'POSTED' } },
          select: { direction: true, amount: true, currency_code: true },
        });
        const currentBalance = balanceLines.reduce(
          (sum, line) => sum + (line.direction === 'DEBIT' ? Number(line.amount) : -Number(line.amount)),
          0,
        );
        if (reduction > currentBalance) {
          const currency = balanceLines[0]?.currency_code ?? '';
          throw new BadRequestException(
            `Không đủ tồn quỹ để đảo giao dịch: còn ${currentBalance} ${currency}, cần ${reduction}`,
          );
        }
      }

      const domesticBankMovement = txn.operation_code === 'DOMESTIC_TRANSFER'
        ? await tx.bank_balance_movements.findFirst({
            where: {
              bank_reference: `DOMESTIC:${transactionId}`,
              status: 'POSTED',
            },
          })
        : null;
      let domesticBankBalance: number | null = null;
      if (txn.operation_code === 'DOMESTIC_TRANSFER') {
        if (!domesticBankMovement) {
          throw new BadRequestException('Không tìm thấy biến động ngân hàng của giao dịch chuyển tiền');
        }
        await tx.$queryRaw`SELECT id FROM bank_accounts WHERE id = ${domesticBankMovement.bank_account_id}::uuid FOR UPDATE`;
        if (domesticBankMovement.movement_type === 'ADVANCE_CK') {
          const advanceSettlement = await tx.bank_balance_movements.findFirst({
            where: {
              movement_type: 'ADVANCE_SETTLE',
              bank_reference: domesticBankMovement.id,
              status: 'POSTED',
            },
            select: { movement_no: true },
          });
          if (advanceSettlement) {
            throw new BadRequestException(
              `Không thể hủy hoặc thay thế vì khoản ứng chuyển khoản đã được hoàn (${advanceSettlement.movement_no})`,
            );
          }
        }
        const account = await tx.bank_accounts.findUnique({ where: { id: domesticBankMovement.bank_account_id } });
        if (!account) throw new BadRequestException('Không tìm thấy tài khoản ngân hàng của giao dịch');
        domesticBankBalance = Number(account.current_balance);
        if (domesticBankMovement.movement_type === 'TRANSFER_IN'
          && Number(domesticBankMovement.amount) > domesticBankBalance) {
          throw new BadRequestException('Không đủ số dư ngân hàng để đảo giao dịch chuyển tiền');
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

      if (domesticBankMovement && domesticBankBalance !== null) {
        const amount = Number(domesticBankMovement.amount);
        const reversesTransferOut = ['TRANSFER_OUT', 'ADVANCE_CK'].includes(domesticBankMovement.movement_type);
        const balanceAfter = reversesTransferOut
          ? domesticBankBalance + amount
          : domesticBankBalance - amount;
        await tx.bank_balance_movements.create({
          data: {
            movement_no: `REV-DT-${Date.now()}-${Math.floor(Math.random() * 1000)}`,
            bank_account_id: domesticBankMovement.bank_account_id,
            branch_id: txn.branch_id,
            movement_type: reversesTransferOut ? 'TRANSFER_IN' : 'TRANSFER_OUT',
            business_date: businessDate,
            amount,
            currency_code: domesticBankMovement.currency_code,
            balance_before: domesticBankBalance,
            balance_after: balanceAfter,
            bank_reference: `DOMESTIC_VOID:${transactionId}`,
            description: `Đảo giao dịch ${txn.transaction_no}: ${reason}`,
            status: 'POSTED',
            posted_at: now,
            created_by_user_id: userId,
          },
        });
        await tx.bank_accounts.update({
          where: { id: domesticBankMovement.bank_account_id },
          data: { current_balance: balanceAfter, available_balance: balanceAfter },
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
