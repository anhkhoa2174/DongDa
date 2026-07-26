// FX Controller — Mua/Bán ngoại tệ
// Layer: Interface (HTTP)
//   POST /fx/transactions   tạo GD (mua/bán)
//   GET  /fx/transactions   danh sách
//   GET  /fx/stock          tồn ngoại tệ (Quỹ A)

import { Controller, Post, Get, Body, Query, UseGuards, Request } from '@nestjs/common';
import { JwtAuthGuard } from '../guards/jwt-auth.guard';
import { RolesGuard, Roles } from '../guards/roles.guard';
import { UserRole } from '../../../domain/entities/user.entity';
import { CreateFxUseCase, ListFxUseCase } from '../../../application/use-cases/fx/fx.use-cases';
import { CreateFxDto, ListFxQueryDto } from '../../../application/dtos/fx/fx.dto';

@Controller('fx')
@UseGuards(JwtAuthGuard)
export class FxController {
  constructor(
    private readonly createFx: CreateFxUseCase,
    private readonly listFx: ListFxUseCase,
  ) {}

  @Get('transactions')
  list(@Query() query: ListFxQueryDto) {
    return this.listFx.list(query);
  }

  @Get('stock')
  stock(@Query('branchId') branchId?: string) {
    return this.listFx.stock(branchId);
  }

  @Post('transactions')
  @UseGuards(RolesGuard)
  @Roles(UserRole.ADMIN, UserRole.MANAGER, UserRole.STAFF)
  create(@Request() req: any, @Body() dto: CreateFxDto) {
    return this.createFx.execute(dto, req.user.id);
  }
}
