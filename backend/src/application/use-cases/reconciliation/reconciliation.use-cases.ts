// Use Cases: Đối chiếu Journal
// Layer: Application

import { Injectable, Inject, BadRequestException } from '@nestjs/common';
import { IReconciliationRepository } from '../../../domain/repositories/reconciliation.repository';
import { reconcile } from '../../../domain/entities/reconciliation.entity';
import type { RunReconciliationDto } from '../../dtos/reconciliation/reconciliation.dto';
import { toVietnamBusinessDate } from '../../../infrastructure/database/business-date';

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
    const currencyCode = rows[0].currencyCode;
    const system = await this.repo.listSystemTxByProvider(dto.provider, businessDate, dto.branchId);
    const result = reconcile(system, rows);
    return this.repo.saveRun({
      provider: dto.provider,
      businessDate,
      scope,
      branchId: dto.branchId,
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
}
