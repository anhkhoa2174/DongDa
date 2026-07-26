// WU Controller — Giao dịch Western Union
// Layer: Interface (HTTP)
//   POST /wu/transactions   tạo GD (quỹ giảm + công nợ tăng + snapshot rate)
//   GET  /wu/transactions   danh sách

import {
  Controller, Post, Get, Body, Query, UseGuards, Request,
} from '@nestjs/common';
import { JwtAuthGuard } from '../guards/jwt-auth.guard';
import { RolesGuard, Roles } from '../guards/roles.guard';
import { UserRole } from '../../../domain/entities/user.entity';
import { CreateWuUseCase, ListWuUseCase } from '../../../application/use-cases/wu/wu.use-cases';
import { CreateWuDto, ListWuQueryDto } from '../../../application/dtos/wu/wu.dto';

@Controller('wu/transactions')
@UseGuards(JwtAuthGuard)
export class WuController {
  constructor(
    private readonly createWu: CreateWuUseCase,
    private readonly listWu: ListWuUseCase,
  ) {}

  @Get()
  list(@Query() query: ListWuQueryDto) {
    return this.listWu.execute(query);
  }

  // Tạo GD — nhân viên chi nhánh / KTTH / GĐ
  @Post()
  @UseGuards(RolesGuard)
  @Roles(UserRole.ADMIN, UserRole.MANAGER, UserRole.STAFF)
  create(@Request() req: any, @Body() dto: CreateWuDto) {
    return this.createWu.execute(dto, req.user.id);
  }
}
