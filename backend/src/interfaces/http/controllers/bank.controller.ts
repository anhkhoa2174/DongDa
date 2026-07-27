// Bank Controller — Ngân hàng (F7)
// Layer: Interface (HTTP)
//   GET  /bank/accounts        danh sách tài khoản NH + số dư
//   GET  /bank/movements       lịch sử biến động
//   POST /bank/receive         ghi nhận tiền WU/MG về → NH tăng + công nợ giảm

import { Controller, Post, Get, Body, Query, UseGuards, Request } from '@nestjs/common';
import { JwtAuthGuard } from '../guards/jwt-auth.guard';
import { RolesGuard, Roles } from '../guards/roles.guard';
import { UserRole } from '../../../domain/entities/user.entity';
import { ListBankUseCase, ReceiveFromProviderUseCase } from '../../../application/use-cases/bank/bank.use-cases';
import { ReceiveFromProviderDto } from '../../../application/dtos/bank/bank.dto';

@Controller('bank')
@UseGuards(JwtAuthGuard)
export class BankController {
  constructor(
    private readonly listBank: ListBankUseCase,
    private readonly receive: ReceiveFromProviderUseCase,
  ) {}

  @Get('accounts')
  accounts() {
    return this.listBank.accounts();
  }

  @Get('movements')
  movements(@Query('bankAccountId') bankAccountId?: string) {
    return this.listBank.movements(bankAccountId);
  }

  // Ghi nhận tiền về — KTTH/GĐ
  @Post('receive')
  @UseGuards(RolesGuard)
  @Roles(UserRole.ADMIN, UserRole.MANAGER)
  receiveMoney(@Request() req: any, @Body() dto: ReceiveFromProviderDto) {
    return this.receive.execute(dto, req.user.id);
  }
}
