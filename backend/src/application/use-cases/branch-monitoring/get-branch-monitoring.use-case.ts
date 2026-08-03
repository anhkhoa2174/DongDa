import { BadRequestException, Inject, Injectable } from '@nestjs/common';
import {
  IBranchMonitoringRepository,
  MonitoringPeriod,
} from '../../../domain/repositories/branch-monitoring.repository';

@Injectable()
export class GetBranchMonitoringUseCase {
  constructor(
    @Inject('IBranchMonitoringRepository')
    private readonly repository: IBranchMonitoringRepository,
  ) {}

  listBranches() {
    return this.repository.listBranches();
  }

  getFunds(branchId: string) {
    return this.repository.getFunds(branchId);
  }

  getActivity(branchId: string, period: MonitoringPeriod, date?: string) {
    const anchorDate = date ? new Date(`${date}T00:00:00.000Z`) : new Date();
    if (Number.isNaN(anchorDate.getTime())) throw new BadRequestException('Ngày theo dõi không hợp lệ');
    return this.repository.getActivity(branchId, period, anchorDate);
  }
}
