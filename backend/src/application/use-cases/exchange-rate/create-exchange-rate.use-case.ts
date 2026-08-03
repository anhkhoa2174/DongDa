// Use Case: Tạo tỷ giá (trạng thái DRAFT — chờ duyệt)
// Layer: Application

import { Injectable, Inject } from '@nestjs/common';
import {
  IExchangeRateRepository,
} from '../../../domain/repositories/exchange-rate.repository';
import { ExchangeRate, ExchangeRateType, ServiceProvider } from '../../../domain/entities/exchange-rate.entity';
import type { CreateExchangeRateDto } from '../../dtos/exchange-rate/exchange-rate.dto';

@Injectable()
export class CreateExchangeRateUseCase {
  constructor(
    @Inject('IExchangeRateRepository')
    private readonly rateRepo: IExchangeRateRepository,
  ) {}

  async execute(dto: CreateExchangeRateDto, createdByUserId: string): Promise<ExchangeRate> {
    return this.rateRepo.create({
      rateType: dto.rateType,
      provider: resolveProvider(dto.rateType, dto.provider),
      fromCurrency: dto.fromCurrency,
      toCurrency: dto.toCurrency ?? 'VND',
      buyRate: dto.buyRate ?? null,
      sellRate: dto.sellRate ?? null,
      rate: dto.rate,
      effectiveFrom: dto.effectiveFrom ? new Date(dto.effectiveFrom) : new Date(),
      createdByUserId,
    });
  }
}

function resolveProvider(rateType: ExchangeRateType, provider?: ServiceProvider) {
  if (
    rateType === ExchangeRateType.PAID_BUY ||
    rateType === ExchangeRateType.PAID_SELL ||
    rateType === ExchangeRateType.WU_SYSTEM ||
    rateType === ExchangeRateType.WU_PROVIDER ||
    rateType === ExchangeRateType.MG_SYSTEM
  ) {
    return ServiceProvider.WU_MG;
  }

  if (rateType === ExchangeRateType.BANK_RATE) {
    return ServiceProvider.BANK;
  }

  if (rateType === ExchangeRateType.FX_BUY || rateType === ExchangeRateType.FX_SELL) {
    return provider ?? ServiceProvider.INTERNAL;
  }

  return provider ?? null;
}
