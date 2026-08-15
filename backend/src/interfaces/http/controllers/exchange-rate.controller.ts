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
  UploadedFile, UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { JwtAuthGuard } from '../guards/jwt-auth.guard';
import { RolesGuard, Roles } from '../guards/roles.guard';
import { UserRole } from '../../../domain/entities/user.entity';
import { CreateExchangeRateUseCase } from '../../../application/use-cases/exchange-rate/create-exchange-rate.use-case';
import { ApproveExchangeRateUseCase } from '../../../application/use-cases/exchange-rate/approve-exchange-rate.use-case';
import { RejectExchangeRateUseCase } from '../../../application/use-cases/exchange-rate/reject-exchange-rate.use-case';
import { ListExchangeRatesUseCase } from '../../../application/use-cases/exchange-rate/list-exchange-rates.use-case';
import { ParseExchangeRateImageUseCase } from '../../../application/use-cases/exchange-rate/parse-exchange-rate-image.use-case';
import {
  CreateExchangeRateBatchDto, CreateExchangeRateDto, ExchangeRateHistoryQueryDto, ListRatesQueryDto,
} from '../../../application/dtos/exchange-rate/exchange-rate.dto';

@Controller('exchange-rates')
@UseGuards(JwtAuthGuard)
export class ExchangeRateController {
  constructor(
    private readonly createRate: CreateExchangeRateUseCase,
    private readonly approveRate: ApproveExchangeRateUseCase,
    private readonly rejectRate: RejectExchangeRateUseCase,
    private readonly listRates: ListExchangeRatesUseCase,
    private readonly parseRateImage: ParseExchangeRateImageUseCase,
  ) {}

  @Post('parse-image')
  @UseGuards(RolesGuard)
  @Roles(UserRole.ADMIN, UserRole.MANAGER)
  @UseInterceptors(FileInterceptor('image', { limits: { fileSize: 10 * 1024 * 1024, files: 1 } }))
  parseImage(@UploadedFile() file?: Express.Multer.File) {
    return this.parseRateImage.execute(file);
  }

  // Tạo — chỉ KTTH (MANAGER) / GĐ (ADMIN)
  @Post()
  @UseGuards(RolesGuard)
  @Roles(UserRole.ADMIN, UserRole.MANAGER)
  create(@Request() req: any, @Body() dto: CreateExchangeRateDto) {
    return this.createRate.execute(dto, req.user.id);
  }

  @Post('batch')
  @UseGuards(RolesGuard)
  @Roles(UserRole.ADMIN, UserRole.MANAGER)
  createBatch(@Request() req: any, @Body() dto: CreateExchangeRateBatchDto) {
    return this.createRate.executeBatch(dto, req.user.id);
  }

  // Liệt kê (mọi vai trò đã đăng nhập đều xem được)
  @Get()
  list(@Query() query: ListRatesQueryDto) {
    return this.listRates.list(query);
  }

  // Lịch sử toàn hệ thống — GĐ/KTTH/Auditor
  @Get('history')
  @UseGuards(RolesGuard)
  @Roles(UserRole.ADMIN, UserRole.MANAGER, UserRole.AUDITOR)
  history(@Query() query: ExchangeRateHistoryQueryDto) {
    return this.listRates.history(query);
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
