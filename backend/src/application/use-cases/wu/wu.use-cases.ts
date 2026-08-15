// Use Cases: Western Union — Flow WU
// Layer: Application

import { Injectable, Inject, BadRequestException, ConflictException } from '@nestjs/common';
import { IWuRepository, ListWuFilter } from '../../../domain/repositories/wu.repository';
import { IExchangeRateRepository } from '../../../domain/repositories/exchange-rate.repository';
import { WuTransaction, Currency2 } from '../../../domain/entities/wu.entity';
import { ExchangeRateType, ServiceProvider } from '../../../domain/entities/exchange-rate.entity';
import type { CreateWuDto } from '../../dtos/wu/wu.dto';

@Injectable()
export class CreateWuUseCase {
  constructor(
    @Inject('IWuRepository') private readonly wuRepo: IWuRepository,
    @Inject('IExchangeRateRepository') private readonly rateRepo: IExchangeRateRepository,
  ) {}

  async execute(dto: CreateWuDto, createdByUserId: string): Promise<WuTransaction> {
    if (await this.wuRepo.mtcnExists(dto.mtcn)) {
      throw new ConflictException(`MSKH (MTCN) ${dto.mtcn} đã được xử lý`);
    }
    if (Number(dto.receivedUsd ?? 0) <= 0 && Number(dto.receivedVnd ?? 0) <= 0) {
      throw new BadRequestException('Phải nhập số tiền thực trả cho khách');
    }

    const rateType = dto.payoutCurrency === 'VND'
      ? ExchangeRateType.PAID_BUY
      : ExchangeRateType.PAID_SELL;
    const active = await this.rateRepo.findActive({
      rateType,
      provider: ServiceProvider.WU_MG,
      fromCurrency: 'USD',
    });
    const systemRate = active[0]?.rate;
    if (!systemRate) {
      throw new BadRequestException(`Chưa có tỷ giá ACTIVE ${rateType} cho WU/MG USD`);
    }
    const wuRate = dto.wuUsdAmount > 0 ? dto.wuVndAmount / dto.wuUsdAmount : systemRate;
    const appliedRate = validateAppliedRate(dto.appliedRate, wuRate, systemRate);
    assertWuPayoutMatches(dto, appliedRate);

    return this.wuRepo.create({
      branchId: dto.branchId,
      mtcn: dto.mtcn,
      customerName: dto.customerName,
      wuUsdAmount: dto.wuUsdAmount,
      wuVndAmount: dto.wuVndAmount,
      receivedUsd: dto.receivedUsd,
      receivedVnd: dto.receivedVnd,
      appliedRate,
      systemRate,
      paidCurrency: dto.paidCurrency as Currency2,
      payoutCurrency: dto.payoutCurrency as Currency2,
      createdByUserId,
    });
  }
}

@Injectable()
export class ListWuUseCase {
  constructor(@Inject('IWuRepository') private readonly wuRepo: IWuRepository) {}
  execute(filter?: ListWuFilter): Promise<WuTransaction[]> {
    return this.wuRepo.list(filter);
  }
}

export function validateAppliedRate(value: number, firstRate: number, secondRate: number) {
  if (!Number.isFinite(value) || value <= 0) {
    throw new BadRequestException('Tỷ giá áp dụng phải là số dương hợp lệ');
  }
  if (!Number.isInteger(value) || value % 5 !== 0) {
    throw new BadRequestException('Tỷ giá áp dụng WU phải là số nguyên theo bước 5 VND');
  }
  const rates = [firstRate, secondRate].filter((rate) => Number.isFinite(rate) && rate > 0);
  if (rates.length === 0) return value;
  const min = Math.min(...rates);
  const max = Math.max(...rates);
  if (value < min || value > max) {
    throw new BadRequestException(`Tỷ giá áp dụng phải nằm trong biên ${min} - ${max}`);
  }
  return value;
}

export function assertWuPayoutMatches(dto: CreateWuDto, appliedRate: number) {
  const receivedUsd = Number(dto.receivedUsd ?? 0);
  const receivedVnd = Number(dto.receivedVnd ?? 0);
  const wuUsd = Number(dto.wuUsdAmount ?? 0);

  if (receivedUsd > 0 && !Number.isInteger(receivedUsd)) {
    throw new BadRequestException('WU: USD thực trả phải là số nguyên, phần lẻ sau dấu . quy đổi sang VND');
  }

  if (dto.payoutCurrency === 'VND') {
    if (receivedUsd > 0) {
      throw new BadRequestException('WU: khách nhận VND thì không được ghi USD thực trả');
    }
    if (receivedVnd <= 0) {
      throw new BadRequestException('WU: khách nhận VND thì phải nhập số VND thực trả');
    }
    const expectedVnd = Math.round(wuUsd * appliedRate);
    if (Math.abs(receivedVnd - expectedVnd) > 1) {
      throw new BadRequestException(`WU: VND thực trả phải bằng Amount USD nhân tỷ giá áp dụng (${expectedVnd} VND)`);
    }
    return;
  }

  const maxReceivedUsd = Math.trunc(Math.max(wuUsd, 0));
  if (receivedUsd < 0 || receivedUsd > maxReceivedUsd) {
    throw new BadRequestException(`WU: USD thực trả phải nằm trong khoảng 0 - ${maxReceivedUsd} USD`);
  }
  const convertedUsd = Math.max(wuUsd - receivedUsd, 0);
  const expectedVnd = Math.round(convertedUsd * appliedRate);
  if (Math.abs(receivedVnd - expectedVnd) > 1) {
    throw new BadRequestException(`WU: VND thực trả phải bằng phần USD còn lại quy đổi theo tỷ giá (${expectedVnd} VND)`);
  }
}
