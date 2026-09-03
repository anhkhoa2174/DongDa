// WU Controller — Giao dịch Western Union
// Layer: Interface (HTTP)
//   POST /wu/transactions   tạo GD (quỹ giảm + công nợ tăng + snapshot rate)
//   GET  /wu/transactions   danh sách
//   GET  /wu/transactions/:id/preview   dữ liệu form GD để xem trước
//   GET  /wu/transactions/:id/pdf       xuất form GD thành PDF
//   POST /wu/transactions/forms/:bank   xuất form phiếu ACB/MSB (Excel)

import {
  Controller, Post, Get, Body, Query, UseGuards, Request, Param, Res, StreamableFile, NotFoundException,
} from '@nestjs/common';
import type { Response } from 'express';
import { JwtAuthGuard } from '../guards/jwt-auth.guard';
import { RolesGuard, Roles } from '../guards/roles.guard';
import { BranchAccessGuard } from '../guards/branch-access.guard';
import { UserRole } from '../../../domain/entities/user.entity';
import { CreateWuUseCase, ListWuUseCase } from '../../../application/use-cases/wu/wu.use-cases';
import { CreateWuDto, ListWuQueryDto } from '../../../application/dtos/wu/wu.dto';
import { ExportWuFormUseCase } from '../../../application/use-cases/wu/export-wu-form.use-case';
import { buildWuFormPdf } from '../../../application/use-cases/reports/build-pdf';

@Controller('wu/transactions')
@UseGuards(JwtAuthGuard, BranchAccessGuard)
export class WuController {
  constructor(
    private readonly createWu: CreateWuUseCase,
    private readonly listWu: ListWuUseCase,
    private readonly exportWuForm: ExportWuFormUseCase,
  ) {}

  @Get()
  list(@Request() req: any, @Query() query: ListWuQueryDto) {
    if (req.user?.role === UserRole.STAFF) query.branchId = req.user.branchId;
    return this.listWu.execute(query);
  }

  @Get('recent-options')
  recentOptions(@Request() req: any, @Query('branchId') branchId?: string) {
    const scopedBranchId = req.user?.role === UserRole.STAFF ? req.user.branchId : branchId;
    return this.listWu.recentOptions(scopedBranchId);
  }

  // Tạo GD — Staff tạo tại chi nhánh mình; GĐ/KTTH được tạo tại chi nhánh cần điều chỉnh.
  @Post()
  @UseGuards(RolesGuard)
  @Roles(UserRole.ADMIN, UserRole.MANAGER, UserRole.STAFF)
  create(@Request() req: any, @Body() dto: CreateWuDto) {
    if (req.user?.role === UserRole.STAFF) dto.branchId = req.user.branchId;
    return this.createWu.execute(dto, req.user.id);
  }

  // Xem trước dữ liệu form GD trước khi tải PDF
  @Get(':id/preview')
  async getPreview(@Param('id') id: string) {
    const tx = await this.listWu.findById(id);
    if (!tx) throw new NotFoundException('Không tìm thấy giao dịch WU');
    return tx;
  }

  // Xuất form GD thành PDF (DongDav6)
  @Get(':id/pdf')
  async getPdf(@Param('id') id: string, @Res({ passthrough: true }) res: Response) {
    const tx = await this.listWu.findById(id);
    if (!tx) throw new NotFoundException('Không tìm thấy giao dịch WU');
    const profit = Math.round((tx.wuRate - tx.appliedRate) * tx.wuUsdAmount);
    const pdfBuffer = buildWuFormPdf({ ...tx, profit });
    res.set({
      'Content-Type': 'application/pdf',
      'Content-Disposition': `attachment; filename="WU-${tx.mtcn}.pdf"`,
    });
    return new StreamableFile(pdfBuffer);
  }

  @Post('forms/:bank')
  @UseGuards(RolesGuard)
  @Roles(UserRole.ADMIN, UserRole.MANAGER, UserRole.STAFF)
  async exportForm(
    @Request() req: any,
    @Param('bank') bank: string,
    @Body() dto: CreateWuDto,
    @Res() response: Response,
  ) {
    if (req.user?.role === UserRole.STAFF) dto.branchId = req.user.branchId;
    const result = await this.exportWuForm.execute(bank, dto);
    response.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    response.setHeader('Content-Disposition', `attachment; filename="${result.filename}"`);
    response.send(result.buffer);
  }
}
