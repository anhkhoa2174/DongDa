// FX Controller — Mua/Bán ngoại tệ
// Layer: Interface (HTTP)
//   POST /fx/transactions   tạo GD (mua/bán)
//   GET  /fx/transactions   danh sách
//   GET  /fx/stock          tồn ngoại tệ (Quỹ A)

import { Controller, Post, Get, Body, Query, UseGuards, Request } from '@nestjs/common';
import { JwtAuthGuard } from '../guards/jwt-auth.guard';
import { RolesGuard, Roles } from '../guards/roles.guard';
import { BranchAccessGuard } from '../guards/branch-access.guard';
import { UserRole } from '../../../domain/entities/user.entity';
import { CreateFxUseCase, ListFxUseCase } from '../../../application/use-cases/fx/fx.use-cases';
import { CreateFxDto, ListFxQueryDto } from '../../../application/dtos/fx/fx.dto';

@Controller('fx')
@UseGuards(JwtAuthGuard, BranchAccessGuard)
export class FxController {
  constructor(
    private readonly createFx: CreateFxUseCase,
    private readonly listFx: ListFxUseCase,
  ) {}

  @Get('transactions')
  list(@Request() req: any, @Query() query: ListFxQueryDto) {
    if (req.user?.role === UserRole.STAFF) query.branchId = req.user.branchId;
    return this.listFx.list(query);
  }

  @Get('stock')
  stock(@Request() req: any, @Query('branchId') branchId?: string) {
    return this.listFx.stock(req.user?.role === UserRole.STAFF ? req.user.branchId : branchId);
  }

  @Post('transactions')
  @UseGuards(RolesGuard)
  @Roles(UserRole.ADMIN, UserRole.MANAGER, UserRole.STAFF)
  create(@Request() req: any, @Body() dto: CreateFxDto) {
    if (req.user?.role === UserRole.STAFF) dto.branchId = req.user.branchId;
    return this.createFx.execute(dto, req.user.id);
  }
}
