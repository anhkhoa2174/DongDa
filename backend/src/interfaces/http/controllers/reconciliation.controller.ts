// Reconciliation Controller — Đối chiếu Journal (diagram 4)
// Layer: Interface (HTTP)
//   POST /reconciliation/run                  chạy đối chiếu (KTTH/GĐ)
//   GET  /reconciliation/runs                 danh sách lần đối chiếu
//   GET  /reconciliation/runs/:id/items       chi tiết sai lệch
//   POST /reconciliation/parse-journal        parse file (KTTH trực tiếp)
//   POST /reconciliation/upload-journal       STAFF upload journal → PENDING_REVIEW
//   GET  /reconciliation/pending-journals     KTTH xem danh sách chờ duyệt
//   GET  /reconciliation/pending-journals/:id chi tiết 1 pending journal

import {
  Controller, Post, Get, Body, Param, Query, UseGuards, Request,
  UseInterceptors, UploadedFile, BadRequestException,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { JwtAuthGuard } from '../guards/jwt-auth.guard';
import { RolesGuard, Roles } from '../guards/roles.guard';
import { UserRole } from '../../../domain/entities/user.entity';
import {
  RunReconciliationUseCase, ListReconciliationUseCase,
  UploadJournalUseCase, ListPendingJournalsUseCase,
} from '../../../application/use-cases/reconciliation/reconciliation.use-cases';
import { ParseJournalUseCase } from '../../../application/use-cases/reconciliation/parse-journal.use-case';
import { RunReconciliationDto } from '../../../application/dtos/reconciliation/reconciliation.dto';

@Controller('reconciliation')
@UseGuards(JwtAuthGuard)
export class ReconciliationController {
  constructor(
    private readonly runRecon: RunReconciliationUseCase,
    private readonly listRecon: ListReconciliationUseCase,
    private readonly parseJournal: ParseJournalUseCase,
    private readonly uploadJournal: UploadJournalUseCase,
    private readonly listPending: ListPendingJournalsUseCase,
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

  // Updated: (2) Đối chiếu toàn chi nhánh tại KTTH/GĐ
  @Post('run')
  @UseGuards(RolesGuard)
  @Roles(UserRole.ADMIN, UserRole.MANAGER)
  run(@Request() req: any, @Body() dto: RunReconciliationDto) {
    return this.runRecon.execute(dto, req.user.id);
  }

  // Parse file WU/MG Journal trực tiếp (KTTH/GĐ) — không qua pending
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
      return this.parseJournal.executePdf(file.buffer, file.originalname, provider);
    }
    return this.parseJournal.execute(file.buffer, file.originalname, provider);
  }

  // ─── LUỒNG CHI NHÁNH (STAFF) ───────────────────────────────────────────────
  // Updated: tách Đối chiếu thành 2 nghiệp vụ — (1) Upload WU/MG tại chi nhánh rồi gửi về KTTH (gom theo chi nhánh)
  // STAFF upload file journal → parse → lưu PENDING_REVIEW → thông báo KTTH

  @Post('upload-journal')
  @UseGuards(RolesGuard)
  @Roles(UserRole.ADMIN, UserRole.MANAGER, UserRole.STAFF)
  @UseInterceptors(FileInterceptor('file', { limits: { fileSize: 15 * 1024 * 1024 } }))
  async uploadJournalForBranch(
    @Request() req: any,
    @UploadedFile() file: any,
    @Query('provider') provider: string,
    @Query('businessDate') businessDate: string,
  ) {
    if (!file) throw new BadRequestException('Vui lòng chọn file Journal (.pdf/.csv/.xlsx/.xls)');
    if (provider !== 'WU' && provider !== 'MG') {
      throw new BadRequestException('provider phải là WU hoặc MG');
    }
    // STAFF chỉ được upload cho chi nhánh của mình
    const branchId: string | undefined = req.user?.role === UserRole.STAFF
      ? req.user.branchId
      : req.query.branchId;

    // Parse file → lấy rows
    const isPdf = /\.pdf$/i.test(file.originalname ?? '') || file.mimetype === 'application/pdf';
    const parsed = isPdf
      ? await this.parseJournal.executePdf(file.buffer, file.originalname, provider)
      : await this.parseJournal.execute(file.buffer, file.originalname, provider);

    // Lưu PENDING_REVIEW
    return this.uploadJournal.execute(
      (parsed as any).rows ?? parsed,
      provider as 'WU' | 'MG',
      businessDate,
      branchId,
      req.user.id,
    );
  }

  // KTTH/GĐ xem danh sách journal chờ duyệt
  @Get('pending-journals')
  @UseGuards(RolesGuard)
  @Roles(UserRole.ADMIN, UserRole.MANAGER, UserRole.AUDITOR)
  pendingJournals(@Query('branchId') branchId?: string) {
    return this.listPending.list(branchId);
  }

  // KTTH/GĐ xem chi tiết 1 pending journal (rows đã parse)
  @Get('pending-journals/:id')
  @UseGuards(RolesGuard)
  @Roles(UserRole.ADMIN, UserRole.MANAGER, UserRole.AUDITOR)
  pendingJournalDetail(@Param('id') id: string) {
    return this.listPending.getDetail(id);
  }
}

