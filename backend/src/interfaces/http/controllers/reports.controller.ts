// Reports Controller — Báo cáo tổng hợp + Dashboard summary
// Layer: Interface (HTTP)

import { Controller, Get, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../guards/jwt-auth.guard';
import { GetSummaryUseCase } from '../../../application/use-cases/reports/get-summary.use-case';

@Controller('reports')
@UseGuards(JwtAuthGuard)
export class ReportsController {
  constructor(private readonly getSummary: GetSummaryUseCase) {}

  // Dùng chung cho cả Dashboard và Báo cáo tổng hợp
  @Get('summary')
  summary() {
    return this.getSummary.execute();
  }
}
