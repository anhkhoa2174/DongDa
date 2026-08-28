// Use Cases: Đối chiếu Journal
// Layer: Application

import { Injectable, Inject, BadRequestException } from '@nestjs/common';
import { IReconciliationRepository } from '../../../domain/repositories/reconciliation.repository';
import { reconcile } from '../../../domain/entities/reconciliation.entity';
import type { RunReconciliationDto } from '../../dtos/reconciliation/reconciliation.dto';
import { toVietnamBusinessDate } from '../../../infrastructure/database/business-date';
import { NotificationService } from '../../../infrastructure/notifications/notification.service';

@Injectable()
export class RunReconciliationUseCase {
  constructor(
    @Inject('IReconciliationRepository') private readonly repo: IReconciliationRepository,
  ) {}

  async execute(dto: RunReconciliationDto, createdByUserId: string) {
    if (dto.provider === 'WU' && !dto.branchId) {
      throw new BadRequestException('Journal WU phải chọn chi nhánh');
    }
    const businessDate = toVietnamBusinessDate(new Date(`${dto.businessDate}T00:00:00+07:00`));
    const scope = dto.provider === 'WU' ? 'BRANCH' : 'COMPANY';
    const rows = dto.rows.map((row) => ({
      ...row,
      code: row.code.trim().toUpperCase(),
      currencyCode: row.currencyCode ?? 'USD',
      branchId: scope === 'BRANCH' ? dto.branchId : row.branchId,
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
    const system = await this.repo.listSystemTxByProvider(dto.provider, businessDate, dto.branchId);
    const result = reconcile(system, rows);
    return this.repo.saveRun({
      provider: dto.provider,
      businessDate,
      scope,
      // scope COMPANY yêu cầu branch_id NULL (chk_journal_file_scope) — chỉ gán khi scope BRANCH
      branchId: scope === 'BRANCH' ? dto.branchId : undefined,
      currencyCode,
      result,
      createdByUserId,
    });
  }
}

@Injectable()
export class ListReconciliationUseCase {
  constructor(
    @Inject('IReconciliationRepository') private readonly repo: IReconciliationRepository,
  ) {}
  runs() {
    return this.repo.listRuns();
  }
  items(runId: string) {
    return this.repo.getItems(runId);
  }
  // F9.1 — đối chiếu quỹ hệ thống vs kiểm quỹ thực tế
  fundReconciliation(branchId?: string) {
    return this.repo.fundReconciliation(branchId);
  }
}

// STAFF upload journal WU/MG tại chi nhánh → lưu PENDING_REVIEW, thông báo KTTH
@Injectable()
export class UploadJournalUseCase {
  constructor(
    @Inject('IReconciliationRepository') private readonly repo: IReconciliationRepository,
    private readonly notifications: NotificationService,
  ) {}

  async execute(
    parsedRows: Array<{ code: string; amount: number; currencyCode?: string; branchId?: string }>,
    provider: 'WU' | 'MG',
    businessDateStr: string,
    branchId: string | undefined,
    uploadedByUserId: string,
  ) {
    if (!businessDateStr || !/^\d{4}-\d{2}-\d{2}$/.test(businessDateStr)) {
      throw new BadRequestException('businessDate phải có định dạng YYYY-MM-DD');
    }
    const businessDate = toVietnamBusinessDate(new Date(`${businessDateStr}T00:00:00+07:00`));
    const rows = parsedRows.map((row) => ({
      code: row.code.trim().toUpperCase(),
      amount: row.amount,
      currencyCode: row.currencyCode ?? 'USD',
      branchId: provider === 'WU' ? branchId : row.branchId,
    }));

    const pending = await this.repo.savePendingJournal({
      provider,
      businessDate,
      branchId,
      rows,
      createdByUserId: uploadedByUserId,
    });

    // Thông báo cho KTTH/GĐ
    await this.notifications.notifyUsers({
      title: `Journal ${provider} chờ đối chiếu`,
      body: `Chi nhánh đã upload ${rows.length} dòng Journal ${provider} ngày ${businessDateStr}. Vui lòng vào Đối chiếu để duyệt.`,
      sourceType: 'JOURNAL_PENDING_REVIEW',
      sourceId: pending.id,
    }, { roles: ['ADMIN', 'MANAGER'] });

    return pending;
  }
}

// KTTH/GĐ xem danh sách journal chờ duyệt
@Injectable()
export class ListPendingJournalsUseCase {
  constructor(
    @Inject('IReconciliationRepository') private readonly repo: IReconciliationRepository,
  ) {}
  list(branchId?: string) {
    return this.repo.listPendingJournals(branchId);
  }
  getDetail(id: string) {
    return this.repo.getPendingJournal(id);
  }
}

