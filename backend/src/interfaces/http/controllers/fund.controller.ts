// Fund Controller — Flow 3: Tiếp quỹ / Điều chuyển vốn
// Layer: Interface (HTTP)
//
//   GET  /fund/balances            số dư quỹ (từ ledger)
//   POST /fund/transfers           bên gửi tạo phiếu (Pending)
//   GET  /fund/transfers           danh sách phiếu
//   PATCH /fund/transfers/:id/confirm   bên nhận xác nhận → post ledger
//   PATCH /fund/transfers/:id/reject    bên nhận từ chối

import {
  Controller, Post, Get, Patch, Body, Param, Query, UseGuards, Request,
} from '@nestjs/common';
import { JwtAuthGuard } from '../guards/jwt-auth.guard';
import { RolesGuard, Roles } from '../guards/roles.guard';
import { UserRole } from '../../../domain/entities/user.entity';
import {
  CreateTransferUseCase, ConfirmTransferUseCase, RejectTransferUseCase, ListFundUseCase,
} from '../../../application/use-cases/fund/fund-transfer.use-cases';
import { CreateTransferDto, ListTransfersQueryDto } from '../../../application/dtos/fund/fund.dto';

@Controller('fund')
@UseGuards(JwtAuthGuard)
export class FundController {
  constructor(
    private readonly createTransfer: CreateTransferUseCase,
    private readonly confirmTransfer: ConfirmTransferUseCase,
    private readonly rejectTransfer: RejectTransferUseCase,
    private readonly listFund: ListFundUseCase,
  ) {}

  @Get('balances')
  balances(@Query('branchId') branchId?: string) {
    return this.listFund.balances(branchId);
  }

  @Get('transfers')
  transfers(@Query() query: ListTransfersQueryDto) {
    return this.listFund.transfers(query);
  }

  // Tạo phiếu — KTTH/GĐ hoặc nhân viên chi nhánh (STAFF) đều tạo được
  @Post('transfers')
  @UseGuards(RolesGuard)
  @Roles(UserRole.ADMIN, UserRole.MANAGER, UserRole.STAFF)
  create(@Request() req: any, @Body() dto: CreateTransferDto) {
    return this.createTransfer.execute(dto, req.user.id);
  }

  // Xác nhận (bên nhận) — post ledger, chuyển số dư
  @Patch('transfers/:id/confirm')
  @UseGuards(RolesGuard)
  @Roles(UserRole.ADMIN, UserRole.MANAGER, UserRole.STAFF)
  confirm(@Request() req: any, @Param('id') id: string) {
    return this.confirmTransfer.execute(id, req.user.id);
  }

  @Patch('transfers/:id/reject')
  @UseGuards(RolesGuard)
  @Roles(UserRole.ADMIN, UserRole.MANAGER, UserRole.STAFF)
  reject(@Request() req: any, @Param('id') id: string) {
    return this.rejectTransfer.execute(id, req.user.id);
  }
}
