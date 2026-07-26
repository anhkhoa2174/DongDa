// MG Controller — Giao dịch MoneyGram
// Layer: Interface (HTTP)

import { Controller, Post, Get, Body, Query, UseGuards, Request } from '@nestjs/common';
import { JwtAuthGuard } from '../guards/jwt-auth.guard';
import { RolesGuard, Roles } from '../guards/roles.guard';
import { UserRole } from '../../../domain/entities/user.entity';
import { CreateMgUseCase, ListMgUseCase } from '../../../application/use-cases/mg/mg.use-cases';
import { CreateMgDto, ListMgQueryDto } from '../../../application/dtos/mg/mg.dto';

@Controller('mg/transactions')
@UseGuards(JwtAuthGuard)
export class MgController {
  constructor(
    private readonly createMg: CreateMgUseCase,
    private readonly listMg: ListMgUseCase,
  ) {}

  @Get()
  list(@Query() query: ListMgQueryDto) {
    return this.listMg.execute(query);
  }

  @Post()
  @UseGuards(RolesGuard)
  @Roles(UserRole.ADMIN, UserRole.MANAGER, UserRole.STAFF)
  create(@Request() req: any, @Body() dto: CreateMgDto) {
    return this.createMg.execute(dto, req.user.id);
  }
}
