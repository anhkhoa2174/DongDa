// Reports Controller — Báo cáo tổng hợp + Dashboard summary
// Layer: Interface (HTTP)

import { Controller, Get, Query, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../guards/jwt-auth.guard';
import { RolesGuard, Roles } from '../guards/roles.guard';
import { UserRole } from '../../../domain/entities/user.entity';
import { GetSummaryUseCase } from '../../../application/use-cases/reports/get-summary.use-case';

@Controller('reports')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(UserRole.ADMIN, UserRole.MANAGER, UserRole.AUDITOR)
export class ReportsController {
  constructor(private readonly getSummary: GetSummaryUseCase) {}

  // Dùng chung cho cả Dashboard và Báo cáo tổng hợp
  @Get('summary')
  summary(@Query('branchId') branchId?: string) {
    return this.getSummary.execute({ branchId });
  }

  @Get('dashboard-operations')
  dashboardOperations(@Query('date') date?: string) {
    return this.getSummary.dashboardOperations(date);
  }

  @Get('company-dashboard')
  companyDashboard(@Query('date') date?: string) {
    return this.getSummary.companyDashboard(date);
  }
}
