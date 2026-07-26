// ExchangeRate Controller — Flow 1: Duyệt tỷ giá
// Layer: Interface (HTTP)
//
//   POST   /exchange-rates            KTTH/GĐ tạo tỷ giá (DRAFT)
//   GET    /exchange-rates            liệt kê (lọc theo status/type/provider)
//   GET    /exchange-rates/active     tỷ giá đang áp dụng
//   PATCH  /exchange-rates/:id/approve  duyệt → ACTIVE + supersede bản cũ
//   PATCH  /exchange-rates/:id/reject   từ chối → REJECTED

import {
  Controller, Post, Get, Patch, Body, Param, Query,
  UseGuards, Request, HttpCode, HttpStatus,
} from '@nestjs/common';
import { JwtAuthGuard } from '../guards/jwt-auth.guard';
import { RolesGuard, Roles } from '../guards/roles.guard';
import { UserRole } from '../../../domain/entities/user.entity';
import { CreateExchangeRateUseCase } from '../../../application/use-cases/exchange-rate/create-exchange-rate.use-case';
import { ApproveExchangeRateUseCase } from '../../../application/use-cases/exchange-rate/approve-exchange-rate.use-case';
import { RejectExchangeRateUseCase } from '../../../application/use-cases/exchange-rate/reject-exchange-rate.use-case';
import { ListExchangeRatesUseCase } from '../../../application/use-cases/exchange-rate/list-exchange-rates.use-case';
import {
  CreateExchangeRateDto, ListRatesQueryDto,
} from '../../../application/dtos/exchange-rate/exchange-rate.dto';

@Controller('exchange-rates')
@UseGuards(JwtAuthGuard)
export class ExchangeRateController {
  constructor(
    private readonly createRate: CreateExchangeRateUseCase,
    private readonly approveRate: ApproveExchangeRateUseCase,
    private readonly rejectRate: RejectExchangeRateUseCase,
    private readonly listRates: ListExchangeRatesUseCase,
  ) {}

  // Tạo — chỉ KTTH (MANAGER) / GĐ (ADMIN)
  @Post()
  @UseGuards(RolesGuard)
  @Roles(UserRole.ADMIN, UserRole.MANAGER)
  create(@Request() req: any, @Body() dto: CreateExchangeRateDto) {
    return this.createRate.execute(dto, req.user.id);
  }

  // Liệt kê (mọi vai trò đã đăng nhập đều xem được)
  @Get()
  list(@Query() query: ListRatesQueryDto) {
    return this.listRates.list(query);
  }

  // Tỷ giá đang áp dụng
  @Get('active')
  active() {
    return this.listRates.active();
  }

  // Duyệt — KTTH/GĐ
  @Patch(':id/approve')
  @UseGuards(RolesGuard)
  @Roles(UserRole.ADMIN, UserRole.MANAGER)
  approve(@Request() req: any, @Param('id') id: string) {
    return this.approveRate.execute(id, req.user.id);
  }

  // Từ chối — KTTH/GĐ
  @Patch(':id/reject')
  @UseGuards(RolesGuard)
  @Roles(UserRole.ADMIN, UserRole.MANAGER)
  @HttpCode(HttpStatus.OK)
  reject(@Param('id') id: string) {
    return this.rejectRate.execute(id);
  }
}
