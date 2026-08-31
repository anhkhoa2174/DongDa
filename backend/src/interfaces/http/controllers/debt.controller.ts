// Debt Controller — Flow 2: Công nợ WU/MG
// Layer: Interface (HTTP)
//
//   GET  /debts                   danh sách sổ nợ (+ outstanding + status)
//   GET  /debts/:id/movements     lịch sử biến động của 1 sổ
//   POST /debts/settle-batch      tất toán các khoản đã RECONCILED

import {
  Controller, Post, Get, Body, Param, Query,
  UseGuards, Request,
} from '@nestjs/common';
import { JwtAuthGuard } from '../guards/jwt-auth.guard';
import { RolesGuard, Roles } from '../guards/roles.guard';
import { UserRole } from '../../../domain/entities/user.entity';
import {
  SettleDebtBatchUseCase, SettleUsdCashDebtUseCase, SettleVndCashDebtUseCase,
} from '../../../application/use-cases/debt/settle-debt.use-case';
import { ListDebtsUseCase } from '../../../application/use-cases/debt/list-debts.use-case';
import {
  SettleDebtBatchDto, SettleUsdCashDebtDto, SettleVndCashDebtDto, ListDebtsQueryDto,
} from '../../../application/dtos/debt/debt.dto';

@Controller('debts')
@UseGuards(JwtAuthGuard)
export class DebtController {
  constructor(
    private readonly settleUsdCashDebt: SettleUsdCashDebtUseCase,
    private readonly settleVndCashDebt: SettleVndCashDebtUseCase,
    private readonly settleDebtBatch: SettleDebtBatchUseCase,
    private readonly listDebts: ListDebtsUseCase,
  ) {}

  // Danh sách sổ nợ
  @Get()
  list(@Request() req: any, @Query() query: ListDebtsQueryDto) {
    if (req.user?.role === UserRole.STAFF) query.branchId = req.user.branchId;
    return this.listDebts.list({
      ...query,
      businessDate: query.businessDate ? new Date(query.businessDate) : undefined,
      dateFrom: query.dateFrom ? new Date(query.dateFrom) : undefined,
      dateTo: query.dateTo ? new Date(query.dateTo) : undefined,
    } as any);
  }

  // Lịch sử biến động 1 sổ
  @Get(':id/movements')
  @UseGuards(RolesGuard)
  @Roles(UserRole.ADMIN, UserRole.MANAGER, UserRole.AUDITOR)
  movements(@Param('id') id: string) {
    return this.listDebts.movements(id);
  }

  @Post(':id/settle-usd-cash')
  @UseGuards(RolesGuard)
  @Roles(UserRole.ADMIN, UserRole.MANAGER)
  settleUsdCash(@Request() req: any, @Param('id') id: string, @Body() dto: SettleUsdCashDebtDto) {
    return this.settleUsdCashDebt.execute(id, dto, req.user.id);
  }

  @Post(':id/settle-vnd-cash')
  @UseGuards(RolesGuard)
  @Roles(UserRole.ADMIN, UserRole.MANAGER)
  settleVndCash(@Request() req: any, @Param('id') id: string, @Body() dto: SettleVndCashDebtDto) {
    return this.settleVndCashDebt.execute(id, dto, req.user.id);
  }

  @Post('settle-batch')
  @UseGuards(RolesGuard)
  @Roles(UserRole.ADMIN, UserRole.MANAGER)
  settleBatch(@Request() req: any, @Body() dto: SettleDebtBatchDto) {
    return this.settleDebtBatch.execute(dto, req.user.id);
  }
}
