// Reports Controller — Báo cáo tổng hợp + Dashboard summary
// Layer: Interface (HTTP)

import {
  BadRequestException, Body, Controller, Get, Post, Query, Request, Res, StreamableFile, UseGuards,
} from '@nestjs/common';
import type { Response } from 'express';
import { IsDateString, IsIn, IsOptional, IsUUID } from 'class-validator';
import * as XLSX from 'xlsx';
import { JwtAuthGuard } from '../guards/jwt-auth.guard';
import { RolesGuard, Roles } from '../guards/roles.guard';
import { UserRole } from '../../../domain/entities/user.entity';
import { GetSummaryUseCase } from '../../../application/use-cases/reports/get-summary.use-case';
import { buildReportModel } from '../../../application/use-cases/reports/report-model';
import { buildPdfBuffer } from '../../../application/use-cases/reports/build-pdf';
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
  async generate(@Request() req: any, @Body() dto: GenerateReportDto, @Res({ passthrough: true }) res: Response) {
    const generatedAt = new Date();
    const data = await this.getSummary.execute(this.reportFilter(dto.branchId, dto.dateFrom, dto.dateTo));
    const model = buildReportModel(dto.reportType, data, {
      branchId: dto.branchId,
      dateFrom: dto.dateFrom,
      dateTo: dto.dateTo,
      generatedAt: generatedAt.toISOString(),
    });

    await this.notifications.notifyUsers({
      title: 'Báo cáo đã sẵn sàng',
      body: `${model.title} (${dto.format}) đã được tổng hợp thành công.`,
      sourceType: 'REPORT_GENERATED',
      sourceId: req.user.id,
    }, { userIds: [req.user.id] });

    // PDF: dùng jsPDF + autoTable
    if (dto.format === 'PDF') {
      const pdfBuffer = buildPdfBuffer(model);
      const fileName = `bao-cao-${dto.reportType}-${generatedAt.toISOString().slice(0, 10)}.pdf`;
      res.set({
        'Content-Type': 'application/pdf',
        'Content-Disposition': `attachment; filename="${fileName}"`,
      });
      return new StreamableFile(pdfBuffer);
    }

    // EXCEL: dựng workbook thật và trả file tải về.
    if (dto.format === 'EXCEL') {
      const wb = XLSX.utils.book_new();
      for (const sheet of model.sheets) {
        const ws = XLSX.utils.aoa_to_sheet(sheet.aoa);
        // tên sheet tối đa 31 ký tự theo chuẩn Excel
        XLSX.utils.book_append_sheet(wb, ws, sheet.name.slice(0, 31));
      }
      const buffer: Buffer = XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' });
      const fileName = `bao-cao-${dto.reportType}-${generatedAt.toISOString().slice(0, 10)}.xlsx`;
      res.set({
        'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        'Content-Disposition': `attachment; filename="${fileName}"`,
      });
      return new StreamableFile(buffer);
    }

    // PREVIEW: trả JSON đúng theo loại báo cáo (không còn trả cùng một cục).
    return { reportType: dto.reportType, format: dto.format, generatedAt, title: model.title, sheets: model.sheets };
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
