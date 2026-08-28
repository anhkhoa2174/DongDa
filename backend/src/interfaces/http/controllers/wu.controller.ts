// WU Controller — Giao dịch Western Union
// Layer: Interface (HTTP)
//   POST /wu/transactions        tạo GD (quỹ giảm + công nợ tăng + snapshot rate)
//   GET  /wu/transactions        danh sách
//   GET  /wu/transactions/:id/pdf      xuất form GD thành PDF
//   GET  /wu/transactions/:id/preview  xem trước dữ liệu form GD

import {
  Controller, Post, Get, Body, Query, Param, UseGuards, Request, Res, StreamableFile, NotFoundException,
} from '@nestjs/common';
import type { Response } from 'express';
import { JwtAuthGuard } from '../guards/jwt-auth.guard';
import { RolesGuard, Roles } from '../guards/roles.guard';
import { BranchAccessGuard } from '../guards/branch-access.guard';
import { UserRole } from '../../../domain/entities/user.entity';
import { CreateWuUseCase, ListWuUseCase } from '../../../application/use-cases/wu/wu.use-cases';
import { CreateWuDto, ListWuQueryDto } from '../../../application/dtos/wu/wu.dto';
import { buildWuFormPdf } from '../../../application/use-cases/reports/build-pdf';

@Controller('wu/transactions')
@UseGuards(JwtAuthGuard, BranchAccessGuard)
export class WuController {
  constructor(
    private readonly createWu: CreateWuUseCase,
    private readonly listWu: ListWuUseCase,
  ) {}

  @Get()
  list(@Request() req: any, @Query() query: ListWuQueryDto) {
    if (req.user?.role === UserRole.STAFF) query.branchId = req.user.branchId;
    return this.listWu.execute(query);
  }

  // Tạo GD — Staff tạo tại chi nhánh mình; GĐ/KTTH được tạo tại chi nhánh cần điều chỉnh.
  @Post()
  @UseGuards(RolesGuard)
  @Roles(UserRole.ADMIN, UserRole.MANAGER, UserRole.STAFF)
  create(@Request() req: any, @Body() dto: CreateWuDto) {
    if (req.user?.role === UserRole.STAFF) dto.branchId = req.user.branchId;
    return this.createWu.execute(dto, req.user.id);
  }

  // Updated: Xuất ra file PDF (preview trước khi tải)
  @Get(':id/pdf')
  async getPdf(
    @Param('id') id: string,
    @Res({ passthrough: true }) res: Response,
  ) {
    const tx = await this.listWu.findById(id);
    if (!tx) throw new NotFoundException('Không tìm thấy giao dịch WU');
    const pdfBuffer = buildWuFormPdf(tx);
    res.set({
      'Content-Type': 'application/pdf',
      'Content-Disposition': `attachment; filename="WU-${tx.mtcn}.pdf"`,
    });
    return new StreamableFile(pdfBuffer);
  }

  // Updated: preview form GD trước khi tải PDF
  @Get(':id/preview')
  async getPreview(@Param('id') id: string) {
    const tx = await this.listWu.findById(id);
    if (!tx) throw new NotFoundException('Không tìm thấy giao dịch WU');
    return tx;
  }
}

