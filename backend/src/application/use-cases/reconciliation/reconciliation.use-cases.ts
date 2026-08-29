// Use Cases: Đối chiếu Journal
// Layer: Application
//
// Phân quyền:
//   - STAFF (chi nhánh): upload Journal + chạy đối chiếu cho CHÍNH chi nhánh của mình,
//     xem lịch sử/chi tiết của chi nhánh mình.
//   - ADMIN/MANAGER (GĐ/KTTH): chạy và xem đối chiếu toàn công ty hoặc từng chi nhánh riêng.
//   - AUDITOR: chỉ xem.

import { Injectable, Inject, BadRequestException, ForbiddenException, NotFoundException } from '@nestjs/common';
import { IReconciliationRepository } from '../../../domain/repositories/reconciliation.repository';
import { reconcile } from '../../../domain/entities/reconciliation.entity';
import { UserRole } from '../../../domain/entities/user.entity';
import type { RunReconciliationDto } from '../../dtos/reconciliation/reconciliation.dto';
import { toVietnamBusinessDate } from '../../../infrastructure/database/business-date';
import { NotificationService } from '../../../infrastructure/notifications/notification.service';

export interface ReconActor {
  id: string;
  role: UserRole;
  branchId?: string | null;
}

// STAFF luôn bị ép về chi nhánh của mình; role toàn cục dùng branchId truyền vào (nếu có).
export function resolveBranchScope(actor: ReconActor, requestedBranchId?: string): string | undefined {
  if (actor.role !== UserRole.STAFF) return requestedBranchId;
  if (!actor.branchId) throw new ForbiddenException('Tài khoản chi nhánh chưa được gán chi nhánh');
  if (requestedBranchId && requestedBranchId !== actor.branchId) {
    throw new ForbiddenException('Chỉ được đối chiếu Journal của chi nhánh mình');
  }
  return actor.branchId;
}

@Injectable()
export class RunReconciliationUseCase {
  constructor(
    @Inject('IReconciliationRepository') private readonly repo: IReconciliationRepository,
  ) {}

  async execute(dto: RunReconciliationDto, actor: ReconActor) {
    const branchId = resolveBranchScope(actor, dto.branchId);
    if (dto.provider === 'WU' && !branchId) {
      throw new BadRequestException('Journal WU phải chọn chi nhánh');
    }
    const businessDate = toVietnamBusinessDate(new Date(`${dto.businessDate}T00:00:00+07:00`));
    // WU luôn theo chi nhánh. MG: có branchId -> đối chiếu riêng chi nhánh đó; không -> toàn công ty.
    const scope: 'COMPANY' | 'BRANCH' = branchId ? 'BRANCH' : 'COMPANY';
    const rows = dto.rows.map((row) => ({
      ...row,
      code: row.code.trim().toUpperCase(),
      currencyCode: row.currencyCode ?? 'USD',
      branchId: scope === 'BRANCH' ? branchId : row.branchId,
    }));
    if (scope === 'COMPANY' && rows.some((row) => !row.branchId)) {
      throw new BadRequestException('Mỗi dòng Journal MG phải xác định chi nhánh');
    }
    const currencies = new Set(rows.map((row) => row.currencyCode));
    if (currencies.size !== 1) {
      throw new BadRequestException('Mỗi lần đối chiếu chỉ được dùng một loại tiền');
    }
    const rowKeys = rows.map((row) => `${row.code}::${row.currencyCode}`);
    const duplicateKeys = [...new Set(rowKeys.filter((key, index) => rowKeys.indexOf(key) !== index))];
    if (duplicateKeys.length > 0) {
      throw new BadRequestException(
        `Journal có MTCN/Reference bị trùng: ${duplicateKeys.map((key) => key.split('::')[0]).join(', ')}`,
      );
    }
    const currencyCode = rows[0].currencyCode;
    const system = await this.repo.listSystemTxByProvider(dto.provider, businessDate, branchId);
    const result = reconcile(system, rows);
    const run = await this.repo.saveRun({
      provider: dto.provider,
      businessDate,
      scope,
      branchId,
      currencyCode,
      result,
      createdByUserId: actor.id,
    });
    // Chạy từ Journal chi nhánh gửi lên -> đánh dấu Journal đó đã duyệt
    if (dto.pendingJournalId) {
      await this.repo.updatePendingJournalStatus(dto.pendingJournalId, 'APPROVED', actor.id);
    }
    return run;
  }
}

@Injectable()
export class ListReconciliationUseCase {
  constructor(
    @Inject('IReconciliationRepository') private readonly repo: IReconciliationRepository,
  ) {}
  runs(actor: ReconActor, branchId?: string) {
    return this.repo.listRuns(resolveBranchScope(actor, branchId));
  }
  async items(actor: ReconActor, runId: string) {
    const run = await this.repo.findRun(runId);
    if (!run) throw new NotFoundException('Không tìm thấy lần đối chiếu');
    if (actor.role === UserRole.STAFF && run.branchId !== actor.branchId) {
      throw new ForbiddenException('Không được xem đối chiếu của chi nhánh khác');
    }
    return this.repo.getItems(runId);
  }
  // F9.1 — đối chiếu quỹ hệ thống vs kiểm quỹ thực tế
  fundReconciliation(branchId?: string) {
    return this.repo.fundReconciliation(branchId);
  }
}

// ---- Luồng chi nhánh (DongDav6): STAFF upload Journal -> lưu chờ KTTH duyệt -> thông báo ----
@Injectable()
export class UploadJournalUseCase {
  constructor(
    @Inject('IReconciliationRepository') private readonly repo: IReconciliationRepository,
    private readonly notifications: NotificationService,
  ) {}

  async execute(
    parsedRows: Array<{ code: string; amount: number; currencyCode?: string; branchId?: string; customerName?: string }>,
    provider: 'WU' | 'MG',
    businessDateStr: string,
    actor: ReconActor,
    requestedBranchId?: string,
  ) {
    if (!businessDateStr || !/^\d{4}-\d{2}-\d{2}$/.test(businessDateStr)) {
      throw new BadRequestException('businessDate phải có định dạng YYYY-MM-DD');
    }
    const branchId = resolveBranchScope(actor, requestedBranchId);
    if (!branchId) throw new BadRequestException('Upload Journal tại chi nhánh phải xác định chi nhánh');
    if (!parsedRows.length) throw new BadRequestException('File Journal không có dòng hợp lệ nào');
    const businessDate = toVietnamBusinessDate(new Date(`${businessDateStr}T00:00:00+07:00`));
    const rows = parsedRows.map((row) => ({
      code: row.code.trim().toUpperCase(),
      amount: row.amount,
      currencyCode: (row.currencyCode ?? 'USD') as 'USD' | 'VND',
      branchId,
      customerName: row.customerName,
    }));

    const pending = await this.repo.savePendingJournal({
      provider, businessDate, branchId, rows, createdByUserId: actor.id,
    });

    await this.notifications.notifyUsers({
      title: `Journal ${provider} chờ đối chiếu`,
      body: `Chi nhánh đã upload ${rows.length} dòng Journal ${provider} ngày ${businessDateStr}. Vui lòng vào Đối chiếu để duyệt.`,
      sourceType: 'JOURNAL_PENDING_REVIEW',
      sourceId: pending.id,
    }, { roles: ['ADMIN', 'MANAGER'], branchIds: [branchId] });

    return pending;
  }
}

// KTTH/GĐ xem danh sách journal chờ duyệt (gom theo chi nhánh)
@Injectable()
export class ListPendingJournalsUseCase {
  constructor(
    @Inject('IReconciliationRepository') private readonly repo: IReconciliationRepository,
  ) {}
  list(actor: ReconActor, branchId?: string) {
    return this.repo.listPendingJournals(resolveBranchScope(actor, branchId));
  }
  async getDetail(actor: ReconActor, id: string) {
    const detail = await this.repo.getPendingJournal(id);
    if (!detail) throw new NotFoundException('Không tìm thấy Journal chờ duyệt');
    if (actor.role === UserRole.STAFF && detail.summary.branchId !== actor.branchId) {
      throw new ForbiddenException('Không được xem Journal của chi nhánh khác');
    }
    return detail;
  }
  // KTTH/GĐ từ chối Journal chi nhánh gửi (file sai ngày, sai chi nhánh...)
  async reject(actor: ReconActor, id: string, _reason?: string) {
    const ok = await this.repo.updatePendingJournalStatus(id, 'REJECTED', actor.id);
    if (!ok) throw new NotFoundException('Journal chờ duyệt không tồn tại hoặc đã được xử lý');
    return { id, status: 'REJECTED' as const };
  }
}
