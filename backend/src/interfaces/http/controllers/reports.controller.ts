// Reports Controller — Báo cáo tổng hợp + Dashboard summary
// Layer: Interface (HTTP)

import { Body, Controller, Get, Post, Query, Request, UseGuards } from '@nestjs/common';
import { IsDateString, IsIn, IsOptional, IsUUID } from 'class-validator';
import { JwtAuthGuard } from '../guards/jwt-auth.guard';
import { RolesGuard, Roles } from '../guards/roles.guard';
import { UserRole } from '../../../domain/entities/user.entity';
import { GetSummaryUseCase } from '../../../application/use-cases/reports/get-summary.use-case';
import { NotificationService } from '../../../infrastructure/notifications/notification.service';

class GenerateReportDto {
  @IsIn(['fund', 'wu', 'mg', 'fx', 'transfer', 'gap', 'debt', 'bank'])
  reportType!: string;

  @IsIn(['PREVIEW', 'EXCEL', 'PDF'])
  format!: string;

  @IsOptional()
  @IsUUID()
  branchId?: string;

  @IsOptional()
  @IsDateString()
  dateFrom?: string;

  @IsOptional()
  @IsDateString()
  dateTo?: string;
}

@Controller('reports')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(UserRole.ADMIN, UserRole.MANAGER, UserRole.AUDITOR)
export class ReportsController {
  constructor(
    private readonly getSummary: GetSummaryUseCase,
    private readonly notifications: NotificationService,
  ) {}

  @Post('generate')
  async generate(@Request() req: any, @Body() dto: GenerateReportDto) {
    const data = await this.getSummary.execute(this.reportFilter(dto.branchId, dto.dateFrom, dto.dateTo));
    await this.notifications.notifyUsers({
      title: 'Báo cáo đã sẵn sàng',
      body: `Báo cáo ${dto.reportType.toUpperCase()} (${dto.format}) đã được tổng hợp thành công.`,
      sourceType: 'REPORT_GENERATED',
      sourceId: req.user.id,
    }, { userIds: [req.user.id] });
    return { reportType: dto.reportType, format: dto.format, generatedAt: new Date(), data };
  }

  // Dùng chung cho cả Dashboard và Báo cáo tổng hợp
  @Get('summary')
  summary(@Query('branchId') branchId?: string, @Query('dateFrom') dateFrom?: string, @Query('dateTo') dateTo?: string) {
    return this.getSummary.execute(this.reportFilter(branchId, dateFrom, dateTo));
  }

  @Get('dashboard-operations')
  dashboardOperations(@Query('date') date?: string) {
    return this.getSummary.dashboardOperations(date);
  }

  @Get('company-dashboard')
  companyDashboard(@Query('date') date?: string) {
    return this.getSummary.companyDashboard(date);
  }

  private reportFilter(branchId?: string, dateFrom?: string, dateTo?: string) {
    const from = dateFrom ? new Date(`${dateFrom}T00:00:00.000Z`) : undefined;
    const toExclusive = dateTo ? new Date(`${dateTo}T00:00:00.000Z`) : undefined;
    if (toExclusive) toExclusive.setUTCDate(toExclusive.getUTCDate() + 1);
    return { branchId, dateFrom: from, dateToExclusive: toExclusive };
  }
}
