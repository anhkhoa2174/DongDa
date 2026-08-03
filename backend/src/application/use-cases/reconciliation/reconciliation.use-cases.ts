// Use Cases: Đối chiếu Journal
// Layer: Application

import { Injectable, Inject } from '@nestjs/common';
import { IReconciliationRepository } from '../../../domain/repositories/reconciliation.repository';
import { reconcile } from '../../../domain/entities/reconciliation.entity';
import type { RunReconciliationDto } from '../../dtos/reconciliation/reconciliation.dto';

@Injectable()
export class RunReconciliationUseCase {
  constructor(
    @Inject('IReconciliationRepository') private readonly repo: IReconciliationRepository,
  ) {}

  async execute(dto: RunReconciliationDto, createdByUserId: string) {
    const system = await this.repo.listSystemTxByProvider(dto.provider);
    const result = reconcile(system, dto.rows);
    return this.repo.saveRun({
      provider: dto.provider,
      businessDate: new Date(),
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
