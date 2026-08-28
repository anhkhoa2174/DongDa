// Bank Controller — Ngân hàng (F7)
// Layer: Interface (HTTP)
//   GET  /bank/accounts        danh sách tài khoản NH + số dư
//   GET  /bank/movements       lịch sử biến động
//   POST /bank/receive         ghi nhận tiền WU/MG về → NH tăng + công nợ giảm
//   POST /bank/advance-ck      ghi nhận số CK tạm ứng trong ngày (nhân viên CN ứng trước)
//   POST /bank/advance-ck/:id/settle   hoàn lại tạm ứng CK cuối ngày
//   GET  /bank/advances        danh sách tạm ứng CK

import { Controller, Post, Get, Body, Query, Param, UseGuards, Request } from '@nestjs/common';
import { JwtAuthGuard } from '../guards/jwt-auth.guard';
import { RolesGuard, Roles } from '../guards/roles.guard';
import { UserRole } from '../../../domain/entities/user.entity';
import {
  ListBankUseCase, ReceiveFromProviderUseCase,
  RecordAdvanceCkUseCase, SettleAdvanceCkUseCase, ListAdvancesUseCase,
} from '../../../application/use-cases/bank/bank.use-cases';
import { ReceiveFromProviderDto, RecordAdvanceCkDto, SettleAdvanceCkDto } from '../../../application/dtos/bank/bank.dto';

@Controller('bank')
@UseGuards(JwtAuthGuard)
export class BankController {
  constructor(
    private readonly listBank: ListBankUseCase,
    private readonly receive: ReceiveFromProviderUseCase,
    private readonly recordAdvance: RecordAdvanceCkUseCase,
    private readonly settleAdvance: SettleAdvanceCkUseCase,
    private readonly listAdvances: ListAdvancesUseCase,
  ) {}

  @Get('accounts')
  accounts(@Request() req: any) {
    return this.listBank.accounts(req.user?.role === UserRole.STAFF ? req.user.branchId : undefined);
  }

  @Get('movements')
  movements(@Request() req: any, @Query('bankAccountId') bankAccountId?: string) {
    return this.listBank.movements(
      bankAccountId,
      req.user?.role === UserRole.STAFF ? req.user.branchId : undefined,
    );
  }

  // Ghi nhận tiền về — KTTH/GĐ
  @Post('receive')
  @UseGuards(RolesGuard)
  @Roles(UserRole.ADMIN, UserRole.MANAGER)
  receiveMoney(@Request() req: any, @Body() dto: ReceiveFromProviderDto) {
    return this.receive.execute(dto, req.user.id);
  }

  // Updated: ghi nhận số CK hằng ngày để cuối ngày dùng Tài khoản chính thanh toán lại
  @Post('advance-ck')
  @UseGuards(RolesGuard)
  @Roles(UserRole.ADMIN, UserRole.MANAGER, UserRole.STAFF)
  recordAdvanceCk(@Request() req: any, @Body() dto: RecordAdvanceCkDto) {
    // STAFF chỉ được ghi cho chi nhánh mình
    if (req.user?.role === UserRole.STAFF) dto.branchId = req.user.branchId;
    return this.recordAdvance.execute(dto, req.user.id);
  }

  // Hoàn lại tạm ứng CK cuối ngày — KTTH/GĐ
  @Post('advance-ck/:id/settle')
  @UseGuards(RolesGuard)
  @Roles(UserRole.ADMIN, UserRole.MANAGER)
  settleAdvanceCk(@Request() req: any, @Param('id') id: string, @Body() dto: SettleAdvanceCkDto) {
    return this.settleAdvance.execute({ ...dto, advanceMovementId: id }, req.user.id);
  }

  // Danh sách tạm ứng CK
  @Get('advances')
  advances(
    @Request() req: any,
    @Query('bankAccountId') bankAccountId?: string,
    @Query('branchId') branchId?: string,
    @Query('status') status?: 'ADVANCE_CK' | 'SETTLED',
  ) {
    const scopedBranchId = req.user?.role === UserRole.STAFF ? req.user.branchId : branchId;
    return this.listAdvances.list({ bankAccountId, branchId: scopedBranchId, status });
  }
}

