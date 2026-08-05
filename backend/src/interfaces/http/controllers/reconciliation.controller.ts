// Reconciliation Controller — Đối chiếu Journal (diagram 4)
// Layer: Interface (HTTP)
//   POST /reconciliation/run        chạy đối chiếu (nhận journal rows đã parse)
//   GET  /reconciliation/runs       danh sách lần đối chiếu
//   GET  /reconciliation/runs/:id/items   chi tiết sai lệch

import { Controller, Post, Get, Body, Param, UseGuards, Request } from '@nestjs/common';
import { JwtAuthGuard } from '../guards/jwt-auth.guard';
import { RolesGuard, Roles } from '../guards/roles.guard';
import { UserRole } from '../../../domain/entities/user.entity';
import { RunReconciliationUseCase, ListReconciliationUseCase } from '../../../application/use-cases/reconciliation/reconciliation.use-cases';
import { RunReconciliationDto } from '../../../application/dtos/reconciliation/reconciliation.dto';

@Controller('reconciliation')
@UseGuards(JwtAuthGuard)
export class ReconciliationController {
  constructor(
    private readonly runRecon: RunReconciliationUseCase,
    private readonly listRecon: ListReconciliationUseCase,
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

  // Chạy đối chiếu — KTTH/GĐ
  @Post('run')
  @UseGuards(RolesGuard)
  @Roles(UserRole.ADMIN, UserRole.MANAGER)
  run(@Request() req: any, @Body() dto: RunReconciliationDto) {
    return this.runRecon.execute(dto, req.user.id);
  }
}
