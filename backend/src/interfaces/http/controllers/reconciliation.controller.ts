// Reconciliation Controller — Đối chiếu Journal (diagram 4)
// Layer: Interface (HTTP)
//   POST /reconciliation/run        chạy đối chiếu (nhận journal rows đã parse)
//   GET  /reconciliation/runs?branchId=   danh sách lần đối chiếu (GĐ/KTTH lọc theo chi nhánh; STAFF chỉ chi nhánh mình)
//   GET  /reconciliation/runs/:id/items   chi tiết sai lệch
//   POST /reconciliation/parse-journal    parse file Journal -> trả dòng để người dùng rà lại rồi /run
//   POST /reconciliation/upload-journal   (DongDav6) chi nhánh upload Journal -> lưu chờ KTTH duyệt, gom theo chi nhánh
//   POST /reconciliation/pending-journals        chi nhánh gửi các dòng đã rà (JSON) về KTTH duyệt
//   GET  /reconciliation/pending-journals        KTTH/GĐ xem danh sách chờ duyệt (?branchId=)
//   POST /reconciliation/pending-journals/:id/reject   KTTH/GĐ từ chối; duyệt = chạy /run kèm pendingJournalId
//   GET  /reconciliation/pending-journals/:id    chi tiết 1 Journal chờ duyệt

import {
  Controller, Post, Get, Body, Param, Query, UseGuards, Request,
  UseInterceptors, UploadedFile, BadRequestException,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { JwtAuthGuard } from '../guards/jwt-auth.guard';
import { RolesGuard, Roles } from '../guards/roles.guard';
import { UserRole } from '../../../domain/entities/user.entity';
import {
  RunReconciliationUseCase, ListReconciliationUseCase, ReconActor, UploadJournalUseCase, ListPendingJournalsUseCase,
} from '../../../application/use-cases/reconciliation/reconciliation.use-cases';
import { ParseJournalUseCase } from '../../../application/use-cases/reconciliation/parse-journal.use-case';
import { RunReconciliationDto, SubmitPendingJournalDto, RejectPendingJournalDto } from '../../../application/dtos/reconciliation/reconciliation.dto';

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
  @Roles(UserRole.ADMIN, UserRole.MANAGER, UserRole.AUDITOR, UserRole.STAFF)
  runs(@Request() req: any, @Query('branchId') branchId?: string) {
    return this.listRecon.runs(actorOf(req), branchId || undefined);
  }

  @Get('runs/:id/items')
  @UseGuards(RolesGuard)
  @Roles(UserRole.ADMIN, UserRole.MANAGER, UserRole.AUDITOR, UserRole.STAFF)
  items(@Request() req: any, @Param('id') id: string) {
    return this.listRecon.items(actorOf(req), id);
  }

  // F9.1 — Đối chiếu quỹ: tồn hệ thống vs kiểm quỹ thực tế gần nhất (KTTH/GĐ/kiểm toán)
  @Get('fund')
  @UseGuards(RolesGuard)
  @Roles(UserRole.ADMIN, UserRole.MANAGER, UserRole.AUDITOR)
  fund(@Query('branchId') branchId?: string) {
    return this.listRecon.fundReconciliation(branchId);
  }

  // Chạy đối chiếu — chi nhánh (cho chính mình) hoặc KTTH/GĐ (toàn công ty / từng chi nhánh)
  @Post('run')
  @UseGuards(RolesGuard)
  @Roles(UserRole.ADMIN, UserRole.MANAGER, UserRole.STAFF)
  run(@Request() req: any, @Body() dto: RunReconciliationDto) {
    return this.runRecon.execute(dto, actorOf(req));
  }

  // Upload file WU/MG Journal (PDF scan/CSV/XLSX) -> parse ra danh sách dòng đối chiếu.
  // FE hiển thị cho người dùng rà lại rồi bấm "Chạy đối chiếu" (POST /reconciliation/run).
  @Post('parse-journal')
  @UseGuards(RolesGuard)
  @Roles(UserRole.ADMIN, UserRole.MANAGER, UserRole.STAFF)
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

  // (DongDav6) Luồng chi nhánh: upload file Journal -> parse -> lưu chờ KTTH duyệt -> thông báo
  @Post('upload-journal')
  @UseGuards(RolesGuard)
  @Roles(UserRole.ADMIN, UserRole.MANAGER, UserRole.STAFF)
  @UseInterceptors(FileInterceptor('file', { limits: { fileSize: 15 * 1024 * 1024 } }))
  async uploadJournalForBranch(
    @Request() req: any,
    @UploadedFile() file: any,
    @Query('provider') provider: string,
    @Query('businessDate') businessDate: string,
    @Query('branchId') branchId?: string,
  ) {
    if (!file) throw new BadRequestException('Vui lòng chọn file Journal (.pdf/.csv/.xlsx/.xls)');
    if (provider !== 'WU' && provider !== 'MG') {
      throw new BadRequestException('provider phải là WU hoặc MG');
    }
    const isPdf = /\.pdf$/i.test(file.originalname ?? '') || file.mimetype === 'application/pdf';
    const parsed = isPdf
      ? await this.parseJournal.executePdf(file.buffer, file.originalname, provider)
      : this.parseJournal.execute(file.buffer, file.originalname, provider);
    return this.uploadJournal.execute(parsed.rows, provider, businessDate, actorOf(req), branchId || undefined);
  }

  // Chi nhánh gửi các dòng Journal đã rà lại trên UI (không cần upload lại file) về KTTH duyệt
  @Post('pending-journals')
  @UseGuards(RolesGuard)
  @Roles(UserRole.ADMIN, UserRole.MANAGER, UserRole.STAFF)
  submitPendingJournal(@Request() req: any, @Body() dto: SubmitPendingJournalDto) {
    return this.uploadJournal.execute(dto.rows, dto.provider, dto.businessDate, actorOf(req), dto.branchId || undefined);
  }

  @Post('pending-journals/:id/reject')
  @UseGuards(RolesGuard)
  @Roles(UserRole.ADMIN, UserRole.MANAGER)
  rejectPendingJournal(@Request() req: any, @Param('id') id: string, @Body() dto: RejectPendingJournalDto) {
    return this.listPending.reject(actorOf(req), id, dto.reason);
  }

  @Get('pending-journals')
  @UseGuards(RolesGuard)
  @Roles(UserRole.ADMIN, UserRole.MANAGER, UserRole.AUDITOR, UserRole.STAFF)
  pendingJournals(@Request() req: any, @Query('branchId') branchId?: string) {
    return this.listPending.list(actorOf(req), branchId || undefined);
  }

  @Get('pending-journals/:id')
  @UseGuards(RolesGuard)
  @Roles(UserRole.ADMIN, UserRole.MANAGER, UserRole.AUDITOR, UserRole.STAFF)
  pendingJournalDetail(@Request() req: any, @Param('id') id: string) {
    return this.listPending.getDetail(actorOf(req), id);
  }
}

function actorOf(req: any): ReconActor {
  return { id: req.user.id, role: req.user.role, branchId: req.user.branchId ?? null };
}
