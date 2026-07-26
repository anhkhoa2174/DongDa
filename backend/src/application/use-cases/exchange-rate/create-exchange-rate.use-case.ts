// Use Case: Tạo tỷ giá (trạng thái DRAFT — chờ duyệt)
// Layer: Application

import { Injectable, Inject } from '@nestjs/common';
import {
  IExchangeRateRepository,
} from '../../../domain/repositories/exchange-rate.repository';
import { ExchangeRate } from '../../../domain/entities/exchange-rate.entity';
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
      provider: dto.provider ?? null,
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
