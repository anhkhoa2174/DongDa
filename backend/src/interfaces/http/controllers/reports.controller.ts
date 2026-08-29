// Reports Controller — Báo cáo tổng hợp + Dashboard summary
// Layer: Interface (HTTP)

import {
  BadRequestException, Body, Controller, Get, Inject, Post, Query, Request, Res, StreamableFile, UseGuards,
} from '@nestjs/common';
import type { Response } from 'express';
import { IsArray, IsDateString, IsIn, IsOptional, IsString, IsUUID } from 'class-validator';
import * as XLSX from 'xlsx';
import { JwtAuthGuard } from '../guards/jwt-auth.guard';
import { RolesGuard, Roles } from '../guards/roles.guard';
import { UserRole } from '../../../domain/entities/user.entity';
import { GetSummaryUseCase } from '../../../application/use-cases/reports/get-summary.use-case';
import { buildReportModel, type ReportModel } from '../../../application/use-cases/reports/report-model';
import { buildCashBookModel, normalizeCashBookColumns } from '../../../application/use-cases/reports/cashbook-model';
import { buildWuPayoutReportModel, buildProviderLedgerModel } from '../../../application/use-cases/reports/provider-ledger-model';
import { buildPdfBuffer } from '../../../application/use-cases/reports/build-pdf';
import { IReportsRepository } from '../../../domain/repositories/reports.repository';
import { NotificationService } from '../../../infrastructure/notifications/notification.service';

class GenerateReportDto {
  // Theo tên anh Kiển đặt (DongDav6):
  //   cashbook  = #1 Sổ theo dõi thu chi hằng ngày (mẫu sổ quỹ)      — bắt buộc branchId
  //   wu_payout = #2 Báo cáo theo dõi chi trả Western Union          — bắt buộc branchId
  //   wu_usd    = #3 Báo cáo theo dõi thu chi USD (WU, 1 loại tiền)  — bắt buộc branchId, currencyCode mặc định USD
  //   mg_usd    = #4 Báo cáo theo dõi thu chi MoneyGram              — như #3, provider MG
  //   fund #5 · fx #6 · transfer #7 · gap #8 · debt #9 · bank #10 (tổng hợp); wu/mg = tổng hợp cũ
  @IsIn(['fund', 'wu', 'mg', 'fx', 'transfer', 'gap', 'debt', 'bank', 'cashbook', 'wu_payout', 'wu_usd', 'mg_usd'])
  reportType!: string;

  // wu_usd / mg_usd: loại quỹ (USD mặc định)
  @IsOptional()
  @IsIn(['USD', 'VND'])
  currencyCode?: 'USD' | 'VND';

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

  // cashbook: chọn cột hiển thị (stt, date, time, kind, code, name, inUsd, inVnd, outUsd, outVnd, balanceUsd, balanceVnd, description)
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  columns?: string[];
}

@Controller('reports')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(UserRole.ADMIN, UserRole.MANAGER, UserRole.AUDITOR)
export class ReportsController {
  constructor(
    private readonly getSummary: GetSummaryUseCase,
    private readonly notifications: NotificationService,
    @Inject('IReportsRepository') private readonly reports: IReportsRepository,
  ) {}

  @Post('generate')
  async generate(@Request() req: any, @Body() dto: GenerateReportDto, @Res({ passthrough: true }) res: Response) {
    const generatedAt = new Date();
    let model: ReportModel;
    const LEDGER_TYPES = ['cashbook', 'wu_payout', 'wu_usd', 'mg_usd'];
    if (LEDGER_TYPES.includes(dto.reportType)) {
      if (!dto.branchId) throw new BadRequestException('Báo cáo theo sổ quỹ phải chọn chi nhánh (lọc toàn hệ thống sẽ có sau khi có trường "Paid tại")');
      const filter = this.reportFilter(dto.branchId, dto.dateFrom ?? dto.dateTo, dto.dateTo ?? dto.dateFrom);
      if (!filter.dateFrom || !filter.dateToExclusive) throw new BadRequestException('Chọn khoảng ngày cho sổ thu chi');
      const days = Math.round((filter.dateToExclusive.getTime() - filter.dateFrom.getTime()) / 86_400_000);
      if (days > 62) throw new BadRequestException('Sổ thu chi chỉ xuất tối đa 62 ngày mỗi lần');
      const book = await this.reports.dailyCashBook(dto.branchId, filter.dateFrom, filter.dateToExclusive);
      const at = generatedAt.toISOString();
      if (dto.reportType === 'wu_payout') model = buildWuPayoutReportModel(book, at);
      else if (dto.reportType === 'wu_usd') model = buildProviderLedgerModel(book, 'WU', dto.currencyCode ?? 'USD', at);
      else if (dto.reportType === 'mg_usd') model = buildProviderLedgerModel(book, 'MG', dto.currencyCode ?? 'USD', at);
      else model = buildCashBookModel(book, normalizeCashBookColumns(dto.columns), at);
    } else {
      const data = await this.getSummary.execute(this.reportFilter(dto.branchId, dto.dateFrom, dto.dateTo));
      model = buildReportModel(dto.reportType, data, {
        branchId: dto.branchId,
        dateFrom: dto.dateFrom,
        dateTo: dto.dateTo,
        generatedAt: generatedAt.toISOString(),
      });
    }

    await this.notifications.notifyUsers({
      title: 'Báo cáo đã sẵn sàng',
      body: `${model.title} (${dto.format}) đã được tổng hợp thành công.`,
      sourceType: 'REPORT_GENERATED',
      sourceId: req.user.id,
    }, { userIds: [req.user.id] });

    // PDF: jsPDF + autoTable (mỗi sheet 1 bảng)
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
      const fileName = LEDGER_TYPES.includes(dto.reportType)
        ? `${dto.reportType}-${dto.dateFrom ?? ''}_${dto.dateTo ?? ''}.xlsx`
        : `bao-cao-${dto.reportType}-${generatedAt.toISOString().slice(0, 10)}.xlsx`;
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
