// Bank Controller — Ngân hàng (F7)
// Layer: Interface (HTTP)
//   GET   /bank/banks                     danh mục ngân hàng (ACB, MSB...)
//   GET   /bank/accounts?branchId=        danh sách tài khoản NH + số dư (STAFF: chỉ chi nhánh mình)
//   POST  /bank/accounts                  GĐ/KTTH tạo tài khoản NH cho chi nhánh/Hội sở
//   PATCH /bank/accounts/:id/deactivate   GĐ/KTTH ngưng tài khoản (số dư phải = 0)
//   GET   /bank/movements?bankAccountId=  lịch sử biến động
//   POST  /bank/accounts/:id/movements    nộp/rút/chuyển khoản thủ công (STAFF: tài khoản chi nhánh mình)
//   POST  /bank/receive                   ghi nhận tiền WU/MG về → NH tăng + công nợ giảm
//   POST  /bank/advance-ck                ghi nhận số CK tạm ứng trong ngày (nhân viên CN ứng trước)
//   POST  /bank/advance-ck/:id/settle     KTTH/GĐ hoàn lại tạm ứng CK cuối ngày bằng tài khoản chính
//   GET   /bank/advances                  danh sách tạm ứng CK (chưa hoàn / tất cả)

import { Controller, Post, Get, Patch, Body, Param, Query, UseGuards, Request } from '@nestjs/common';
import { JwtAuthGuard } from '../guards/jwt-auth.guard';
import { RolesGuard, Roles } from '../guards/roles.guard';
import { UserRole } from '../../../domain/entities/user.entity';
import {
  ListBankUseCase, ReceiveFromProviderUseCase, ManageBankAccountUseCase, RecordBankMovementUseCase, BankActor,
  RecordAdvanceCkUseCase, SettleAdvanceCkUseCase, ListAdvancesUseCase,
} from '../../../application/use-cases/bank/bank.use-cases';
import {
  ReceiveFromProviderDto, CreateBankAccountDto, CreateBankMovementDto, RecordAdvanceCkDto, SettleAdvanceCkDto,
} from '../../../application/dtos/bank/bank.dto';

@Controller('bank')
@UseGuards(JwtAuthGuard)
export class BankController {
  constructor(
    private readonly listBank: ListBankUseCase,
    private readonly manageAccount: ManageBankAccountUseCase,
    private readonly recordMovement: RecordBankMovementUseCase,
    private readonly receive: ReceiveFromProviderUseCase,
    private readonly recordAdvance: RecordAdvanceCkUseCase,
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

  // Nộp/rút/chuyển khoản thủ công — GĐ/KTTH mọi tài khoản; STAFF chỉ tài khoản chi nhánh mình
  @Post('accounts/:id/movements')
  @UseGuards(RolesGuard)
  @Roles(UserRole.ADMIN, UserRole.MANAGER, UserRole.STAFF)
  createMovement(@Request() req: any, @Param('id') id: string, @Body() dto: CreateBankMovementDto) {
    return this.recordMovement.execute(id, dto, actorOf(req));
  }

  // Ghi nhận tiền về — KTTH/GĐ
  @Post('receive')
  @UseGuards(RolesGuard)
  @Roles(UserRole.ADMIN, UserRole.MANAGER)
  receiveMoney(@Request() req: any, @Body() dto: ReceiveFromProviderDto) {
    return this.receive.execute(dto, req.user.id);
  }

  // Ghi nhận số CK tạm ứng trong ngày (DongDav6) — STAFF chỉ cho chi nhánh mình
  @Post('advance-ck')
  @UseGuards(RolesGuard)
  @Roles(UserRole.ADMIN, UserRole.MANAGER, UserRole.STAFF)
  recordAdvanceCk(@Request() req: any, @Body() dto: RecordAdvanceCkDto) {
    return this.recordAdvance.execute(dto, actorOf(req));
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
