// MG Controller — Giao dịch MoneyGram
// Layer: Interface (HTTP)

import { Controller, Post, Get, Body, Query, UseGuards, Request } from '@nestjs/common';
import { JwtAuthGuard } from '../guards/jwt-auth.guard';
import { RolesGuard, Roles } from '../guards/roles.guard';
import { BranchAccessGuard } from '../guards/branch-access.guard';
import { UserRole } from '../../../domain/entities/user.entity';
import { CreateMgUseCase, ListMgUseCase } from '../../../application/use-cases/mg/mg.use-cases';
import { CreateMgDto, ListMgQueryDto } from '../../../application/dtos/mg/mg.dto';

@Controller('mg/transactions')
@UseGuards(JwtAuthGuard, BranchAccessGuard)
export class MgController {
  constructor(
    private readonly createMg: CreateMgUseCase,
    private readonly listMg: ListMgUseCase,
  ) {}

  @Get()
  list(@Request() req: any, @Query() query: ListMgQueryDto) {
    if (req.user?.role === UserRole.STAFF) query.branchId = req.user.branchId;
    return this.listMg.execute(query);
  }

  @Post()
  @UseGuards(RolesGuard)
  @Roles(UserRole.ADMIN, UserRole.MANAGER, UserRole.STAFF)
  create(@Request() req: any, @Body() dto: CreateMgDto) {
    if (req.user?.role === UserRole.STAFF) dto.branchId = req.user.branchId;
    return this.createMg.execute(dto, req.user.id);
  }
}
