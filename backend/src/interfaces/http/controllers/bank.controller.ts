// Bank Controller — Ngân hàng (F7)
// Layer: Interface (HTTP)
//   GET   /bank/banks                     danh mục ngân hàng (ACB, MSB...)
//   GET   /bank/accounts?branchId=        danh sách tài khoản NH + số dư (STAFF: chỉ chi nhánh mình)
//   POST  /bank/accounts                  GĐ/KTTH tạo tài khoản NH cho chi nhánh/Hội sở
//   PATCH /bank/accounts/:id/deactivate   GĐ/KTTH ngưng tài khoản (số dư phải = 0)
//   GET   /bank/movements?bankAccountId=  lịch sử biến động
//   POST  /bank/accounts/:id/movements    nộp/rút tiền thủ công (STAFF: tài khoản chi nhánh mình)
//   POST  /bank/internal-transfer         chuyển khoản giữa hai tài khoản nội bộ
//   POST  /bank/receive                   ghi nhận tiền WU/MG về → NH tăng + công nợ giảm
//   POST  /bank/advance-ck/:id/settle     KTTH/GĐ hoàn lại tạm ứng CK cuối ngày bằng tài khoản chính
//   GET   /bank/advances                  danh sách tạm ứng CK (chưa hoàn / tất cả)

import { Controller, Post, Get, Headers, Patch, Body, Param, Query, UseGuards, Request } from '@nestjs/common';
import { JwtAuthGuard } from '../guards/jwt-auth.guard';
import { RolesGuard, Roles } from '../guards/roles.guard';
import { UserRole } from '../../../domain/entities/user.entity';
import {
  ListBankUseCase, ReceiveFromProviderUseCase, ManageBankAccountUseCase, RecordBankMovementUseCase, BankActor,
  InternalBankTransferUseCase, SettleAdvanceCkUseCase, ListAdvancesUseCase,
} from '../../../application/use-cases/bank/bank.use-cases';
import {
  ReceiveFromProviderDto, CreateBankAccountDto, CreateBankMovementDto, CreateInternalBankTransferDto,
  SettleAdvanceCkDto,
} from '../../../application/dtos/bank/bank.dto';
import { requireIdempotencyKey } from '../idempotency-key';

@Controller('bank')
@UseGuards(JwtAuthGuard)
export class BankController {
  constructor(
    private readonly listBank: ListBankUseCase,
    private readonly manageAccount: ManageBankAccountUseCase,
    private readonly recordMovement: RecordBankMovementUseCase,
    private readonly internalTransfer: InternalBankTransferUseCase,
    private readonly receive: ReceiveFromProviderUseCase,
    private readonly settleAdvance: SettleAdvanceCkUseCase,
    private readonly listAdvances: ListAdvancesUseCase,
  ) {}

  @Get('banks')
  banks() {
    return this.listBank.banks();
  }

  @Get('accounts')
  accounts(
    @Request() req: any,
    @Query('branchId') branchId?: string,
    @Query('includeInactive') includeInactive?: string,
  ) {
    return this.listBank.accounts(actorOf(req), branchId || undefined, includeInactive === 'true');
  }

  @Post('accounts')
  @UseGuards(RolesGuard)
  @Roles(UserRole.ADMIN, UserRole.MANAGER)
  createAccount(@Request() req: any, @Body() dto: CreateBankAccountDto) {
    return this.manageAccount.create(dto, actorOf(req));
  }

  @Patch('accounts/:id/deactivate')
  @UseGuards(RolesGuard)
  @Roles(UserRole.ADMIN, UserRole.MANAGER)
  deactivateAccount(@Param('id') id: string) {
    return this.manageAccount.deactivate(id);
  }

  @Get('movements')
  movements(@Request() req: any, @Query('bankAccountId') bankAccountId?: string) {
    return this.listBank.movements(actorOf(req), bankAccountId || undefined);
  }

  // Thao tác tiền ra/vào tài khoản chỉ KTTH/GĐ; mọi role xem được danh sách/lịch sử
  @Post('accounts/:id/movements')
  @UseGuards(RolesGuard)
  @Roles(UserRole.ADMIN, UserRole.MANAGER)
  createMovement(
    @Request() req: any,
    @Param('id') id: string,
    @Body() dto: CreateBankMovementDto,
    @Headers('idempotency-key') idempotencyKey?: string,
  ) {
    return this.recordMovement.execute(id, dto, actorOf(req), requireIdempotencyKey(idempotencyKey));
  }

  @Post('internal-transfer')
  @UseGuards(RolesGuard)
  @Roles(UserRole.ADMIN, UserRole.MANAGER)
  transferInternal(
    @Request() req: any,
    @Body() dto: CreateInternalBankTransferDto,
    @Headers('idempotency-key') idempotencyKey?: string,
  ) {
    return this.internalTransfer.execute(dto, actorOf(req), requireIdempotencyKey(idempotencyKey));
  }

  // Ghi nhận tiền về — KTTH/GĐ
  @Post('receive')
  @UseGuards(RolesGuard)
  @Roles(UserRole.ADMIN, UserRole.MANAGER)
  receiveMoney(@Request() req: any, @Body() dto: ReceiveFromProviderDto) {
    return this.receive.execute(dto, req.user.id);
  }

  // Hoàn lại tạm ứng CK cuối ngày bằng tài khoản chính — KTTH/GĐ
  @Post('advance-ck/:id/settle')
  @UseGuards(RolesGuard)
  @Roles(UserRole.ADMIN, UserRole.MANAGER)
  settleAdvanceCk(@Request() req: any, @Param('id') id: string, @Body() dto: SettleAdvanceCkDto) {
    return this.settleAdvance.execute(id, dto, req.user.id);
  }

  // Danh sách tạm ứng CK — STAFF chỉ thấy chi nhánh mình
  @Get('advances')
  advances(
    @Request() req: any,
    @Query('bankAccountId') bankAccountId?: string,
    @Query('branchId') branchId?: string,
    @Query('status') status?: 'ADVANCE_CK' | 'SETTLED',
  ) {
    return this.listAdvances.list(actorOf(req), { bankAccountId, branchId: branchId || undefined, status });
  }
}

function actorOf(req: any): BankActor {
  return { id: req.user.id, role: req.user.role, branchId: req.user.branchId ?? null };
}
