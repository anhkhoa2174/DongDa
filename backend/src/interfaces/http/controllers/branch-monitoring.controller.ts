import { Controller, ForbiddenException, Get, Param, Query, Request, UseGuards } from '@nestjs/common';
import { BranchMonitoringPeriodDto } from '../../../application/dtos/branch-monitoring/branch-monitoring.dto';
import { GetBranchMonitoringUseCase } from '../../../application/use-cases/branch-monitoring/get-branch-monitoring.use-case';
import { UserRole } from '../../../domain/entities/user.entity';
import { JwtAuthGuard } from '../guards/jwt-auth.guard';
import { Roles, RolesGuard } from '../guards/roles.guard';

@Controller('branch-monitoring')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(UserRole.ADMIN, UserRole.MANAGER, UserRole.STAFF)
export class BranchMonitoringController {
  constructor(private readonly monitoring: GetBranchMonitoringUseCase) {}

  @Get('branches')
  async listBranches(@Request() req: any) {
    const branches = await this.monitoring.listBranches();
    if (req.user?.role !== UserRole.STAFF) return branches;
    return branches.filter((branch) => branch.id === req.user.branchId);
  }

  @Get(':branchId/funds')
  getFunds(@Request() req: any, @Param('branchId') branchId: string) {
    return this.monitoring.getFunds(this.scopedBranchId(req, branchId));
  }

  @Get(':branchId/activity')
  getActivity(
    @Request() req: any,
    @Param('branchId') branchId: string,
    @Query() query: BranchMonitoringPeriodDto,
  ) {
    return this.monitoring.getActivity(
      this.scopedBranchId(req, branchId),
      query.period ?? 'day',
      query.date,
    );
  }

  private scopedBranchId(req: any, branchId: string) {
    if (req.user?.role !== UserRole.STAFF) return branchId;
    if (!req.user.branchId || branchId !== req.user.branchId) {
      throw new ForbiddenException('Nhân viên chỉ được xem Dashboard của chi nhánh đang làm việc');
    }
    return req.user.branchId;
  }
}
