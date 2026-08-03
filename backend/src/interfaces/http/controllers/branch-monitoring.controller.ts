import { Controller, Get, Param, Query, UseGuards } from '@nestjs/common';
import { BranchMonitoringPeriodDto } from '../../../application/dtos/branch-monitoring/branch-monitoring.dto';
import { GetBranchMonitoringUseCase } from '../../../application/use-cases/branch-monitoring/get-branch-monitoring.use-case';
import { UserRole } from '../../../domain/entities/user.entity';
import { JwtAuthGuard } from '../guards/jwt-auth.guard';
import { Roles, RolesGuard } from '../guards/roles.guard';

@Controller('branch-monitoring')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(UserRole.ADMIN, UserRole.MANAGER)
export class BranchMonitoringController {
  constructor(private readonly monitoring: GetBranchMonitoringUseCase) {}

  @Get('branches')
  listBranches() {
    return this.monitoring.listBranches();
  }

  @Get(':branchId/funds')
  getFunds(@Param('branchId') branchId: string) {
    return this.monitoring.getFunds(branchId);
  }

  @Get(':branchId/activity')
  getActivity(@Param('branchId') branchId: string, @Query() query: BranchMonitoringPeriodDto) {
    return this.monitoring.getActivity(branchId, query.period ?? 'day', query.date);
  }
}
