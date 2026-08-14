// Reconciliation Controller — Đối chiếu Journal (diagram 4)
// Layer: Interface (HTTP)
//   POST /reconciliation/run        chạy đối chiếu (nhận journal rows đã parse)
//   GET  /reconciliation/runs       danh sách lần đối chiếu
//   GET  /reconciliation/runs/:id/items   chi tiết sai lệch

import {
  Controller, Post, Get, Body, Param, Query, UseGuards, Request,
  UseInterceptors, UploadedFile, BadRequestException,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { JwtAuthGuard } from '../guards/jwt-auth.guard';
import { RolesGuard, Roles } from '../guards/roles.guard';
import { UserRole } from '../../../domain/entities/user.entity';
import { RunReconciliationUseCase, ListReconciliationUseCase } from '../../../application/use-cases/reconciliation/reconciliation.use-cases';
import { ParseJournalUseCase } from '../../../application/use-cases/reconciliation/parse-journal.use-case';
import { RunReconciliationDto } from '../../../application/dtos/reconciliation/reconciliation.dto';

@Controller('reconciliation')
@UseGuards(JwtAuthGuard)
export class ReconciliationController {
  constructor(
    private readonly runRecon: RunReconciliationUseCase,
    private readonly listRecon: ListReconciliationUseCase,
    private readonly parseJournal: ParseJournalUseCase,
  ) {}

  @Get('runs')
  @UseGuards(RolesGuard)
  @Roles(UserRole.ADMIN, UserRole.MANAGER, UserRole.AUDITOR)
  runs() {
    return this.listRecon.runs();
  }

  @Get('runs/:id/items')
  @UseGuards(RolesGuard)
  @Roles(UserRole.ADMIN, UserRole.MANAGER, UserRole.AUDITOR)
  items(@Param('id') id: string) {
    return this.listRecon.items(id);
  }

  // F9.1 — Đối chiếu quỹ: tồn hệ thống vs kiểm quỹ thực tế gần nhất (KTTH/GĐ/kiểm toán)
  @Get('fund')
  @UseGuards(RolesGuard)
  @Roles(UserRole.ADMIN, UserRole.MANAGER, UserRole.AUDITOR)
  fund(@Query('branchId') branchId?: string) {
    return this.listRecon.fundReconciliation(branchId);
  }

  // Chạy đối chiếu — KTTH/GĐ
  @Post('run')
  @UseGuards(RolesGuard)
  @Roles(UserRole.ADMIN, UserRole.MANAGER)
  run(@Request() req: any, @Body() dto: RunReconciliationDto) {
    return this.runRecon.execute(dto, req.user.id);
  }

  // Upload file WU/MG Journal (CSV/XLSX) -> parse ra danh sách dòng đối chiếu.
  // FE hiển thị cho KTTH rà lại rồi bấm "Chạy đối chiếu" (POST /reconciliation/run).
  @Post('parse-journal')
  @UseGuards(RolesGuard)
  @Roles(UserRole.ADMIN, UserRole.MANAGER)
  @UseInterceptors(FileInterceptor('file', { limits: { fileSize: 15 * 1024 * 1024 } }))
  parse(
    @UploadedFile() file: any,
    @Query('provider') provider: string,
  ) {
    if (!file) throw new BadRequestException('Vui lòng chọn file Journal (.pdf/.csv/.xlsx/.xls)');
    if (provider !== 'WU' && provider !== 'MG') {
      throw new BadRequestException('provider phải là WU hoặc MG');
    }
    const isPdf = /\.pdf$/i.test(file.originalname ?? '') || file.mimetype === 'application/pdf';
    if (isPdf) {
      // PDF scan -> OCR (bất đồng bộ)
      return this.parseJournal.executePdf(file.buffer, file.originalname, provider);
    }
    return this.parseJournal.execute(file.buffer, file.originalname, provider);
  }
}
