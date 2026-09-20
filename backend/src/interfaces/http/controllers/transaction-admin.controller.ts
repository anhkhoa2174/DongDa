import {
  BadRequestException, Body, Controller, ForbiddenException, Get, Param, Patch, Post, Query, Request, UseGuards,
} from '@nestjs/common';
import { currency_code, Prisma } from '@prisma/client';
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
import { validateFxAppliedRate } from '../../../application/use-cases/fx/fx.use-cases';
import type { CreateWuDto } from '../../../application/dtos/wu/wu.dto';
import { assertWuPayoutMatches, validateAppliedRate } from '../../../application/use-cases/wu/wu.use-cases';
import {
  assertMgPayoutMatches,
  calculateMgPayout,
  validateMgAppliedRate,
} from '../../../application/use-cases/mg/mg.use-cases';
import {
  normalizeCountryName,
  normalizeUpperText,
  normalizeUsStateName,
} from '../../../domain/services/wu-reference-data';

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
        title: 'Yêu cầu sửa/xóa giao dịch chờ duyệt',
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
        title: 'Yêu cầu sửa/xóa giao dịch đã được duyệt',
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
        title: 'Yêu cầu sửa/xóa giao dịch bị từ chối',
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
      const detail = transaction.wu_transaction_details;
      const mtcn = String(corrected.mtcn ?? detail?.mtcn ?? '').replace(/\D/g, '');
      if (!/^\d{10}$/.test(mtcn)) throw new BadRequestException('MTCN phải gồm đúng 10 chữ số');
      const paidCurrency = this.parseSettlementCurrency(corrected.paidCurrency ?? detail?.paid_currency, 'Paid Currency');
      const payoutCurrency = this.parseSettlementCurrency(corrected.payoutCurrency ?? detail?.payout_currency, 'Tiền khách nhận');
      const appliedRate = Number(corrected.appliedRate ?? detail?.applied_rate);
      if (!Number.isFinite(appliedRate) || appliedRate <= 0) throw new BadRequestException('appliedRate phải là số dương hợp lệ');
      const receivedUsd = this.nonNegativeMoney(corrected.receivedUsd ?? detail?.received_usd, 'receivedUsd');
      const receivedVnd = this.nonNegativeMoney(corrected.receivedVnd ?? detail?.received_vnd, 'receivedVnd', true);
      const requiredText = (field: string, fallback?: unknown) => {
        const value = String(corrected[field] ?? fallback ?? '').trim();
        if (!value) throw new BadRequestException(`${field} không được để trống`);
        return value;
      };
      const optionalText = (field: string, fallback?: unknown) => {
        const value = corrected[field] ?? fallback;
        return value == null || String(value).trim() === '' ? null : String(value).trim();
      };
      const requiredDate = (field: string, fallback?: unknown) => {
        const value = corrected[field] ?? fallback;
        const date = value instanceof Date ? value : new Date(String(value ?? ''));
        if (Number.isNaN(date.getTime())) throw new BadRequestException(`${field} không phải ngày hợp lệ`);
        return date.toISOString();
      };
      const hasVisa = corrected.hasVisa === undefined ? Boolean(detail?.has_visa) : Boolean(corrected.hasVisa);
      return {
        action: 'REPLACE',
        correctedData: {
          mtcn,
          bankAccountId: requiredText('bankAccountId', detail?.bank_account_id),
          customerName: requiredText('customerName', transaction.customer_name),
          customerPhone: requiredText('customerPhone', transaction.customer_phone),
          sendingCountry: normalizeCountryName(requiredText('sendingCountry', detail?.sending_country)),
          senderState: normalizeUsStateName(optionalText('senderState', detail?.sender_state) ?? undefined) ?? null,
          receiverDateOfBirth: requiredDate('receiverDateOfBirth', detail?.receiver_date_of_birth),
          currentAddress: requiredText('currentAddress', detail?.current_address),
          identityAddress: optionalText('identityAddress', detail?.identity_address),
          identityDocumentType: requiredText('identityDocumentType', detail?.identity_document_type),
          identityDocumentNumber: requiredText('identityDocumentNumber', detail?.identity_document_number),
          identityPlaceOfIssue: normalizeUpperText(requiredText('identityPlaceOfIssue', detail?.identity_place_of_issue)),
          identityIssuingCountry: normalizeCountryName(requiredText('identityIssuingCountry', detail?.identity_issuing_country)),
          identityIssueDate: requiredDate('identityIssueDate', detail?.identity_issue_date),
          identityExpiryDate: requiredDate('identityExpiryDate', detail?.identity_expiry_date),
          hasVisa,
          visaType: hasVisa ? requiredText('visaType', detail?.visa_type) : null,
          visaNumber: hasVisa ? requiredText('visaNumber', detail?.visa_number) : null,
          visaIssueDate: hasVisa ? requiredDate('visaIssueDate', detail?.visa_issue_date) : null,
          visaExpiryDate: hasVisa ? requiredDate('visaExpiryDate', detail?.visa_expiry_date) : null,
          employmentStatus: requiredText('employmentStatus', detail?.employment_status),
          countryOfBirth: normalizeCountryName(requiredText('countryOfBirth', detail?.country_of_birth)),
          nationality: normalizeCountryName(requiredText('nationality', detail?.nationality)),
          senderRelationship: requiredText('senderRelationship', detail?.sender_relationship),
          receivePurpose: requiredText('receivePurpose', detail?.receive_purpose),
          senderName: requiredText('senderName', detail?.sender_name),
          receivedDate: requiredDate('receivedDate', detail?.received_date),
          wuUsdAmount,
          wuVndAmount,
          receivedUsd,
          receivedVnd,
          appliedRate,
          paidCurrency,
          payoutCurrency,
        },
      };
    }
    if (transaction.operation_code === 'MG') {
      const paidAmount = positive('paidAmount');
      const detail = transaction.mg_transaction_details;
      const paidCurrency = this.parseSettlementCurrency(corrected.paidCurrency ?? detail?.paid_currency, 'Paid Currency');
      const payoutCurrency = this.parseSettlementCurrency(corrected.payoutCurrency ?? detail?.payout_currency, 'Tiền khách nhận');
      if (paidCurrency === 'VND' && !Number.isInteger(paidAmount)) {
        throw new BadRequestException('Amount VND của MG phải là số nguyên');
      }
      const referenceNo = String(corrected.referenceNo ?? detail?.reference_no ?? '')
        .replace(/[^a-z0-9]/gi, '').toUpperCase();
      if (!/^[A-Z0-9]{8}$/.test(referenceNo)) {
        throw new BadRequestException('Reference Number phải gồm đúng 8 ký tự chữ hoa hoặc số');
      }
      const customerName = String(corrected.customerName ?? transaction.customer_name ?? '').trim();
      const appliedRate = Number(corrected.appliedRate ?? detail?.applied_rate);
      if (!Number.isFinite(appliedRate) || appliedRate <= 0) throw new BadRequestException('appliedRate phải là số dương hợp lệ');
      const payoutAmount = Number(corrected.payoutAmount ?? detail?.payout_amount);
      if (!Number.isFinite(payoutAmount) || payoutAmount <= 0) throw new BadRequestException('payoutAmount phải là số dương hợp lệ');
      const receivedUsd = this.nonNegativeMoney(corrected.receivedUsd ?? detail?.received_usd, 'receivedUsd');
      const receivedVnd = this.nonNegativeMoney(corrected.receivedVnd ?? detail?.received_vnd, 'receivedVnd', true);
      return { action: 'REPLACE', correctedData: {
        referenceNo,
        customerName: customerName || null,
        paidCurrency,
        paidAmount,
        payoutCurrency,
        payoutAmount,
        receivedUsd,
        receivedVnd,
        appliedRate,
      } };
    }
    if (transaction.operation_code === 'FX') {
      const detail = transaction.fx_transaction_details;
      const isBuy = corrected.isBuy === undefined ? Boolean(detail?.is_buy) : Boolean(corrected.isBuy);
      const fxCurrency = String(corrected.fxCurrency ?? detail?.fx_currency ?? '').trim().toUpperCase();
      if (!Object.values(currency_code).includes(fxCurrency as currency_code) || fxCurrency === 'VND') {
        throw new BadRequestException('Ngoại tệ giao dịch không hợp lệ');
      }
      const wholeAmount = this.nonNegativeMoney(corrected.fxAmount ?? detail?.fx_amount, 'fxAmount');
      const fractionalAmount = this.nonNegativeMoney(corrected.fractionalAmount ?? detail?.fractional_amount ?? 0, 'fractionalAmount');
      if (isBuy && !Number.isInteger(wholeAmount)) {
        throw new BadRequestException('Số lượng mua phần nguyên phải là số nguyên; phần lẻ nhập ở ô riêng');
      }
      if (fractionalAmount >= 1) throw new BadRequestException('Phần lẻ phải nhỏ hơn 1 đơn vị ngoại tệ');
      const deductionVnd = this.nonNegativeMoney(corrected.deductionVnd ?? detail?.deduction_vnd ?? 0, 'deductionVnd', true);
      if (!isBuy && (fractionalAmount > 0 || deductionVnd > 0)) {
        throw new BadRequestException('Phần lẻ và khấu trừ chỉ áp dụng khi mua ngoại tệ');
      }
      const totalFxAmount = wholeAmount + fractionalAmount;
      if (totalFxAmount <= 0) throw new BadRequestException('Tổng số lượng ngoại tệ phải lớn hơn 0');
      const rate = Number(corrected.rate ?? detail?.rate);
      if (!Number.isFinite(rate) || rate <= 0) throw new BadRequestException('Tỷ giá giao dịch phải là số dương hợp lệ');
      return { action: 'REPLACE', correctedData: {
        isBuy,
        fxCurrency,
        fxAmount: totalFxAmount,
        fractionalAmount,
        deductionVnd,
        rate,
        customerName: String(corrected.customerName ?? transaction.customer_name ?? '').trim() || null,
      } };
    }
    throw new BadRequestException(`Chưa hỗ trợ thay thế giao dịch ${transaction.operation_code}`);
  }

  private parseSettlementCurrency(value: unknown, label: string): 'USD' | 'VND' {
    if (value !== 'USD' && value !== 'VND') {
      throw new BadRequestException(`${label} phải là USD hoặc VND`);
    }
    return value;
  }

  private nonNegativeMoney(value: unknown, field: string, integer = false) {
    const amount = Number(value);
    if (!Number.isFinite(amount) || amount < 0) {
      throw new BadRequestException(`${field} phải là số không âm hợp lệ`);
    }
    if (integer && !Number.isInteger(amount)) {
      throw new BadRequestException(`${field} phải là số nguyên`);
    }
    if (!integer && Math.abs(amount * 100 - Math.round(amount * 100)) > 1e-8) {
      throw new BadRequestException(`${field} chỉ được có tối đa 2 chữ số thập phân`);
    }
    return amount;
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
      created_at: original.created_at,
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
      const rate = Number(correctedData.appliedRate ?? detail.applied_rate);
      const paidCurrency = this.parseSettlementCurrency(correctedData.paidCurrency ?? detail.paid_currency, 'Paid Currency');
      const payoutCurrency = this.parseSettlementCurrency(correctedData.payoutCurrency ?? detail.payout_currency, 'Tiền khách nhận');
      const receivedUsd = this.nonNegativeMoney(correctedData.receivedUsd ?? detail.received_usd, 'receivedUsd');
      const receivedVnd = this.nonNegativeMoney(correctedData.receivedVnd ?? detail.received_vnd, 'receivedVnd', true);
      const mtcn = String(correctedData.mtcn ?? detail.mtcn).replace(/\D/g, '');

      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${'WU:' + mtcn}))`;
      const duplicateMtcn = await tx.customer_transactions.findFirst({
        where: {
          id: { not: original.id },
          status: 'COMPLETED',
          wu_transaction_details: { is: { mtcn } },
        },
        select: { id: true },
      });
      if (duplicateMtcn) throw new BadRequestException(`MSKH (MTCN) ${mtcn} đã được xử lý`);

      const usesBuyRate = payoutCurrency === 'VND' || (payoutCurrency === 'USD' && paidCurrency === 'USD');
      const rateType = usesBuyRate ? 'PAID_BUY' : 'PAID_SELL';
      const fxRateType = usesBuyRate ? 'FX_BUY' : 'FX_SELL';
      const [activeRate, activeFxRate] = await Promise.all([
        tx.exchange_rates.findFirst({
          where: { status: 'ACTIVE', rate_type: rateType, provider: 'WU_MG', from_currency: 'USD', to_currency: 'VND' },
          orderBy: { effective_from: 'desc' },
        }),
        tx.exchange_rates.findFirst({
          where: { status: 'ACTIVE', rate_type: fxRateType, provider: 'INTERNAL', from_currency: 'USD', to_currency: 'VND' },
          orderBy: { effective_from: 'desc' },
        }),
      ]);
      if (!activeRate || !activeFxRate) {
        throw new BadRequestException(`Chưa có đủ tỷ giá ACTIVE ${rateType}/${fxRateType} cho USD`);
      }
      const systemRate = Number(activeRate.rate);
      const fxUsdRate = Number(activeFxRate.rate);
      const wuRate = wuVndAmount / wuUsdAmount;
      validateAppliedRate(rate, wuRate, systemRate, fxUsdRate);
      assertWuPayoutMatches({
        wuUsdAmount,
        wuVndAmount,
        receivedUsd,
        receivedVnd,
        paidCurrency,
        payoutCurrency,
      } as CreateWuDto, rate);

      const bankAccountId = String(correctedData.bankAccountId ?? detail.bank_account_id ?? '');
      const bankAccount = await tx.bank_accounts.findFirst({
        where: { id: bankAccountId, status: 'ACTIVE', currency_code: paidCurrency },
        select: { id: true },
      });
      if (!bankAccount) throw new BadRequestException(`Tài khoản ngân hàng ${paidCurrency} không tồn tại hoặc đã ngưng hoạt động`);
      const correctedCustomerName = String(correctedData.customerName ?? original.customer_name ?? '').trim();
      const correctedCustomerPhone = String(correctedData.customerPhone ?? original.customer_phone ?? '').trim();
      replacement = await tx.customer_transactions.create({ data: {
        ...commonTransaction,
        customer_name: correctedCustomerName || null,
        customer_phone: correctedCustomerPhone || null,
        transaction_no: `WU-R${commonTransaction.revision}-${Date.now()}-${Math.floor(Math.random() * 1000)}`,
        operation_code: 'WU', amount: wuUsdAmount, currency_code: 'USD', vnd_amount: wuVndAmount,
      } });
      await tx.wu_transaction_details.create({ data: {
        transaction_id: replacement.id,
        bank_account_id: bankAccount.id,
        mtcn,
        sending_country: correctedData.sendingCountry as string ?? detail.sending_country,
        sender_state: correctedData.senderState as string ?? detail.sender_state,
        receiver_date_of_birth: new Date(String(correctedData.receiverDateOfBirth ?? detail.receiver_date_of_birth)),
        current_address: correctedData.currentAddress as string ?? detail.current_address,
        identity_address: correctedData.identityAddress as string ?? detail.identity_address,
        identity_document_type: correctedData.identityDocumentType as string ?? detail.identity_document_type,
        identity_document_number: correctedData.identityDocumentNumber as string ?? detail.identity_document_number,
        identity_place_of_issue: correctedData.identityPlaceOfIssue as string ?? detail.identity_place_of_issue,
        identity_issuing_country: correctedData.identityIssuingCountry as string ?? detail.identity_issuing_country,
        identity_issue_date: new Date(String(correctedData.identityIssueDate ?? detail.identity_issue_date)),
        identity_expiry_date: new Date(String(correctedData.identityExpiryDate ?? detail.identity_expiry_date)),
        has_visa: Boolean(correctedData.hasVisa ?? detail.has_visa),
        visa_type: correctedData.visaType as string ?? detail.visa_type,
        visa_number: correctedData.visaNumber as string ?? detail.visa_number,
        visa_issue_date: correctedData.visaIssueDate ? new Date(String(correctedData.visaIssueDate)) : detail.visa_issue_date,
        visa_expiry_date: correctedData.visaExpiryDate ? new Date(String(correctedData.visaExpiryDate)) : detail.visa_expiry_date,
        employment_status: correctedData.employmentStatus as string ?? detail.employment_status,
        country_of_birth: correctedData.countryOfBirth as string ?? detail.country_of_birth,
        nationality: correctedData.nationality as string ?? detail.nationality,
        sender_relationship: correctedData.senderRelationship as string ?? detail.sender_relationship,
        receive_purpose: correctedData.receivePurpose as string ?? detail.receive_purpose,
        sender_name: correctedData.senderName as string ?? detail.sender_name,
        received_date: new Date(String(correctedData.receivedDate ?? detail.received_date)),
        paid_currency: paidCurrency,
        payout_currency: payoutCurrency,
        wu_usd_amount: wuUsdAmount,
        wu_vnd_amount: wuVndAmount,
        received_usd: receivedUsd,
        received_vnd: receivedVnd,
        wu_rate: wuRate,
        system_rate: systemRate,
        applied_rate: rate,
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
      const debtAmount = paidCurrency === 'USD' ? wuUsdAmount : wuVndAmount;
      await createDebt(replacement.id, replacement.transaction_no, 'WU', paidCurrency, debtAmount);
    } else if (original.operation_code === 'MG' && original.mg_transaction_details) {
      const detail = original.mg_transaction_details;
      const paidAmount = Number(correctedData.paidAmount);
      const rate = Number(correctedData.appliedRate ?? detail.applied_rate);
      const paidCurrency = this.parseSettlementCurrency(correctedData.paidCurrency ?? detail.paid_currency, 'Paid Currency');
      const payoutCurrency = this.parseSettlementCurrency(correctedData.payoutCurrency ?? detail.payout_currency, 'Tiền khách nhận');
      const referenceNo = String(correctedData.referenceNo ?? detail.reference_no).replace(/[^a-z0-9]/gi, '').toUpperCase();
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${'MG:' + referenceNo}))`;
      const duplicateReference = await tx.customer_transactions.findFirst({
        where: {
          id: { not: original.id },
          status: 'COMPLETED',
          mg_transaction_details: { is: { reference_no: referenceNo } },
        },
        select: { id: true },
      });
      if (duplicateReference) throw new BadRequestException(`Reference Number ${referenceNo} đã được xử lý`);

      const rateType = payoutCurrency === 'VND' ? 'PAID_BUY' : 'PAID_SELL';
      const fxRateType = payoutCurrency === 'VND' ? 'FX_BUY' : 'FX_SELL';
      const [activeRate, activeFxRate] = await Promise.all([
        tx.exchange_rates.findFirst({
          where: { status: 'ACTIVE', rate_type: rateType, provider: 'WU_MG', from_currency: 'USD', to_currency: 'VND' },
          orderBy: { effective_from: 'desc' },
        }),
        tx.exchange_rates.findFirst({
          where: { status: 'ACTIVE', rate_type: fxRateType, provider: 'INTERNAL', from_currency: 'USD', to_currency: 'VND' },
          orderBy: { effective_from: 'desc' },
        }),
      ]);
      if (!activeRate || !activeFxRate) throw new BadRequestException(`Chưa có đủ tỷ giá ACTIVE ${rateType}/${fxRateType} cho USD`);
      const systemRate = Number(activeRate.rate);
      validateMgAppliedRate(rate, systemRate, Number(activeFxRate.rate));
      const mgUsdAmount = paidCurrency === 'USD' ? paidAmount : 0;
      const mgVndAmount = paidCurrency === 'VND' ? paidAmount : 0;
      const payoutAmount = calculateMgPayout(paidCurrency, payoutCurrency, mgUsdAmount, mgVndAmount, rate);
      const submittedPayout = Number(correctedData.payoutAmount ?? payoutAmount);
      if (Math.abs(submittedPayout - payoutAmount) > (payoutCurrency === 'VND' ? 1 : 0.01)) {
        throw new BadRequestException(`Số tiền MG phải trả phải là ${payoutAmount.toFixed(payoutCurrency === 'VND' ? 0 : 2)} ${payoutCurrency}`);
      }
      const receivedUsd = this.nonNegativeMoney(correctedData.receivedUsd ?? detail.received_usd, 'receivedUsd');
      const receivedVnd = this.nonNegativeMoney(correctedData.receivedVnd ?? detail.received_vnd, 'receivedVnd', true);
      assertMgPayoutMatches(payoutCurrency, payoutAmount, receivedUsd, receivedVnd, rate);
      replacement = await tx.customer_transactions.create({ data: {
        ...commonTransaction,
        customer_name: String(correctedData.customerName ?? original.customer_name ?? '').trim() || null,
        transaction_no: `MG-R${commonTransaction.revision}-${Date.now()}-${Math.floor(Math.random() * 1000)}`,
        operation_code: 'MG', amount: mgUsdAmount, currency_code: 'USD', vnd_amount: mgVndAmount,
      } });
      await tx.mg_transaction_details.create({ data: {
        transaction_id: replacement.id,
        reference_no: referenceNo,
        payout_currency: payoutCurrency,
        paid_currency: paidCurrency,
        payout_amount: payoutAmount,
        received_usd: receivedUsd,
        received_vnd: receivedVnd,
        system_rate: systemRate,
        applied_rate: rate,
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
      const rate = Number(correctedData.rate ?? detail.rate);
      const isBuy = correctedData.isBuy === undefined ? detail.is_buy : Boolean(correctedData.isBuy);
      const fxCurrency = String(correctedData.fxCurrency ?? detail.fx_currency).toUpperCase() as currency_code;
      const fractionalAmount = Number(correctedData.fractionalAmount ?? detail.fractional_amount ?? 0);
      if (fxAmount <= fractionalAmount) {
        throw new BadRequestException('Tổng số lượng ngoại tệ phải lớn hơn phần lẻ đã ghi nhận');
      }
      const deductionVnd = Number(correctedData.deductionVnd ?? detail.deduction_vnd ?? 0);
      if (!isBuy && (fractionalAmount > 0 || deductionVnd > 0)) {
        throw new BadRequestException('Phần lẻ và khấu trừ chỉ áp dụng khi mua ngoại tệ');
      }
      const activeRate = await tx.exchange_rates.findFirst({
        where: {
          status: 'ACTIVE',
          rate_type: isBuy ? 'FX_BUY' : 'FX_SELL',
          provider: 'INTERNAL',
          from_currency: fxCurrency,
          to_currency: 'VND',
        },
        orderBy: { effective_from: 'desc' },
      });
      if (!activeRate) throw new BadRequestException(`Chưa có tỷ giá ACTIVE ${isBuy ? 'mua' : 'bán'} cho ${fxCurrency}`);
      validateFxAppliedRate(rate, Number(activeRate.rate), Number(activeRate.margin), isBuy);
      const fractionalRate = isBuy ? rate : 0;
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
      const fxAccountId = await fundAccount(fxCurrency);
      const lines: any[] = [
        { fund_account_id: vndAccountId, direction: isBuy ? 'CREDIT' : 'DEBIT', amount: vndAmount,
          currency_code: 'VND', exchange_rate: 1, base_amount_vnd: vndAmount },
        { fund_account_id: fxAccountId, direction: isBuy ? 'DEBIT' : 'CREDIT', amount: fxAmount,
          currency_code: fxCurrency, exchange_rate: rate, base_amount_vnd: vndAmount },
      ];
      await lockAndCheckCredits(lines);
      replacement = await tx.customer_transactions.create({ data: {
        ...commonTransaction,
        customer_name: String(correctedData.customerName ?? original.customer_name ?? '').trim() || null,
        transaction_no: `FX-R${commonTransaction.revision}-${Date.now()}-${Math.floor(Math.random() * 1000)}`,
        operation_code: 'FX', amount: fxAmount, currency_code: fxCurrency, vnd_amount: vndAmount,
      } });
      await tx.fx_transaction_details.create({ data: {
        transaction_id: replacement.id,
        fx_currency: fxCurrency,
        fx_amount: fxAmount,
        rate,
        is_buy: isBuy,
        fractional_amount: fractionalAmount,
        fractional_rate: isBuy ? fractionalRate : null,
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
        ratePolicy: 'REVALIDATE_ACTIVE_FOR_WU_MG_PRESERVE_FX',
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
