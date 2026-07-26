// Debt Controller — Flow 2: Công nợ WU/MG
// Layer: Interface (HTTP)
//
//   POST /debts/record            ghi nhận nợ (tăng) — sau này WU/MG gọi
//   GET  /debts                   danh sách sổ nợ (+ outstanding + status)
//   GET  /debts/:id/movements     lịch sử biến động của 1 sổ
//   POST /debts/:id/settle        trả nợ (giảm) — Pending→Partially→Settled

import {
  Controller, Post, Get, Body, Param, Query,
  UseGuards, Request,
} from '@nestjs/common';
import { JwtAuthGuard } from '../guards/jwt-auth.guard';
import { RolesGuard, Roles } from '../guards/roles.guard';
import { UserRole } from '../../../domain/entities/user.entity';
import { RecordDebtUseCase } from '../../../application/use-cases/debt/record-debt.use-case';
import { SettleDebtUseCase } from '../../../application/use-cases/debt/settle-debt.use-case';
import { ListDebtsUseCase } from '../../../application/use-cases/debt/list-debts.use-case';
import { RecordDebtDto, SettleDebtDto, ListDebtsQueryDto } from '../../../application/dtos/debt/debt.dto';

@Controller('debts')
@UseGuards(JwtAuthGuard)
export class DebtController {
  constructor(
    private readonly recordDebt: RecordDebtUseCase,
    private readonly settleDebt: SettleDebtUseCase,
    private readonly listDebts: ListDebtsUseCase,
  ) {}

  // Ghi nhận nợ — KTTH/GĐ (tạm thời; WU/MG sẽ tự gọi qua service)
  @Post('record')
  @UseGuards(RolesGuard)
  @Roles(UserRole.ADMIN, UserRole.MANAGER)
  record(@Request() req: any, @Body() dto: RecordDebtDto) {
    return this.recordDebt.execute(dto, req.user.id);
  }

  // Danh sách sổ nợ
  @Get()
  list(@Query() query: ListDebtsQueryDto) {
    return this.listDebts.list(query as any);
  }

  // Lịch sử biến động 1 sổ
  @Get(':id/movements')
  movements(@Param('id') id: string) {
    return this.listDebts.movements(id);
  }

  // Trả nợ — KTTH/GĐ
  @Post(':id/settle')
  @UseGuards(RolesGuard)
  @Roles(UserRole.ADMIN, UserRole.MANAGER)
  settle(@Request() req: any, @Param('id') id: string, @Body() dto: SettleDebtDto) {
    return this.settleDebt.execute(id, dto, req.user.id);
  }
}
