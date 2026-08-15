// Fund Controller — Flow 3: Tiếp quỹ
// Layer: Interface (HTTP)
//
//   GET  /fund/balances            số dư quỹ (từ ledger)
//   POST /fund/transfers           bên gửi tạo phiếu (Pending)
//   GET  /fund/transfers           danh sách phiếu
//   PATCH /fund/transfers/:id/confirm   bên nhận xác nhận → post ledger
//   PATCH /fund/transfers/:id/reject    bên nhận từ chối

import {
  Controller, Post, Get, Patch, Body, Param, Query, UseGuards, Request, ForbiddenException,
} from '@nestjs/common';
import { JwtAuthGuard } from '../guards/jwt-auth.guard';
import { RolesGuard, Roles } from '../guards/roles.guard';
import { UserRole } from '../../../domain/entities/user.entity';
import {
  CreateTransferUseCase, ConfirmTransferUseCase, RejectTransferUseCase, ListFundUseCase,
  CreateFundMovementUseCase, ConvertCentralFundUseCase,
} from '../../../application/use-cases/fund/fund-transfer.use-cases';
import {
  ConvertCentralFundDto, CreateCentralFundMovementDto, CreateTransferDto, ListFundMovementHistoryQueryDto, ListTransfersQueryDto,
} from '../../../application/dtos/fund/fund.dto';

@Controller('fund')
@UseGuards(JwtAuthGuard)
export class FundController {
  constructor(
    private readonly createTransfer: CreateTransferUseCase,
    private readonly confirmTransfer: ConfirmTransferUseCase,
    private readonly rejectTransfer: RejectTransferUseCase,
    private readonly listFund: ListFundUseCase,
    private readonly createFundMovement: CreateFundMovementUseCase,
    private readonly convertCentralFund: ConvertCentralFundUseCase,
  ) {}

  @Get('balances')
  balances(@Request() req: any, @Query('branchId') branchId?: string) {
    const scopedBranchId = this.staffBranchScope(req, branchId);
    return this.listFund.balances(scopedBranchId);
  }

  @Get('central-summary')
  @UseGuards(RolesGuard)
  @Roles(UserRole.ADMIN, UserRole.MANAGER, UserRole.AUDITOR)
  centralSummary() {
    return this.listFund.centralSummary();
  }

  @Get('movement-history')
  movementHistory(@Request() req: any, @Query() query: ListFundMovementHistoryQueryDto) {
    const branchId = this.staffBranchScope(req, query.branchId);
    return this.listFund.movementHistory({
      branchId,
      ...(query.dateFrom && { dateFrom: new Date(query.dateFrom) }),
      ...(query.dateTo && { dateTo: new Date(query.dateTo) }),
    });
  }

  @Post('central-movements')
  @UseGuards(RolesGuard)
  @Roles(UserRole.ADMIN, UserRole.MANAGER)
  centralFundMovement(@Request() req: any, @Body() dto: CreateCentralFundMovementDto) {
    return this.createFundMovement.execute(dto, req.user.id);
  }

  @Post('central-conversions')
  @UseGuards(RolesGuard)
  @Roles(UserRole.ADMIN, UserRole.MANAGER)
  centralFundConversion(@Request() req: any, @Body() dto: ConvertCentralFundDto) {
    return this.convertCentralFund.execute(dto, req.user.id);
  }

  @Post('branch-movements')
  @UseGuards(RolesGuard)
  @Roles(UserRole.STAFF)
  branchFundMovement(@Request() req: any, @Body() dto: CreateCentralFundMovementDto) {
    return this.createFundMovement.execute(dto, req.user.id, req.user.branchId);
  }

  @Get('transfers')
  transfers(@Request() req: any, @Query() query: ListTransfersQueryDto) {
    if (req.user?.role === UserRole.STAFF) {
      query.branchId = this.staffBranchScope(req, query.branchId);
    }
    return this.listFund.transfers(query);
  }

  // Tạo phiếu — KTTH/GĐ hoặc nhân viên chi nhánh (STAFF) đều tạo được
  @Post('transfers')
  @UseGuards(RolesGuard)
  @Roles(UserRole.ADMIN, UserRole.MANAGER, UserRole.STAFF)
  create(@Request() req: any, @Body() dto: CreateTransferDto) {
    return this.createTransfer.execute(dto, req.user);
  }

  // Xác nhận (bên nhận) — post ledger, chuyển số dư
  @Patch('transfers/:id/confirm')
  @UseGuards(RolesGuard)
  @Roles(UserRole.ADMIN, UserRole.MANAGER, UserRole.STAFF)
  confirm(@Request() req: any, @Param('id') id: string) {
    return this.confirmTransfer.execute(id, req.user);
  }

  @Patch('transfers/:id/reject')
  @UseGuards(RolesGuard)
  @Roles(UserRole.ADMIN, UserRole.MANAGER, UserRole.STAFF)
  reject(@Request() req: any, @Param('id') id: string) {
    return this.rejectTransfer.execute(id, req.user);
  }

  private staffBranchScope(req: any, branchId?: string) {
    if (req.user?.role !== UserRole.STAFF) return branchId;
    if (branchId && branchId !== req.user.branchId) {
      throw new ForbiddenException('Nhân viên chỉ được xem dữ liệu quỹ của chi nhánh đang làm việc');
    }
    return req.user.branchId;
  }
}
