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
    return this.repo.saveRun({
      provider: dto.provider,
      businessDate,
      scope,
      branchId,
      currencyCode,
      result,
      createdByUserId: actor.id,
    });
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
