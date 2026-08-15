// Use Case: Tạo tỷ giá (trạng thái DRAFT — chờ duyệt)
// Layer: Application

import { BadRequestException, ConflictException, Injectable, Inject } from '@nestjs/common';
import {
  CreateExchangeRateData, IExchangeRateRepository,
} from '../../../domain/repositories/exchange-rate.repository';
import { ExchangeRate, ExchangeRateType, ServiceProvider } from '../../../domain/entities/exchange-rate.entity';
import type { CreateExchangeRateBatchDto, CreateExchangeRateDto } from '../../dtos/exchange-rate/exchange-rate.dto';

@Injectable()
export class CreateExchangeRateUseCase {
  constructor(
    @Inject('IExchangeRateRepository')
    private readonly rateRepo: IExchangeRateRepository,
  ) {}

  async execute(dto: CreateExchangeRateDto, createdByUserId: string): Promise<ExchangeRate> {
    const data = this.toData(dto, createdByUserId);
    await this.assertNoPendingRate(data);
    return this.rateRepo.create(data);
  }

  async executeBatch(dto: CreateExchangeRateBatchDto, createdByUserId: string): Promise<ExchangeRate[]> {
    assertSingleMarginPerFxPair(dto.rates);
    const items = dto.rates.map((rate) => this.toData(rate, createdByUserId));
    assertUniqueRateIdentities(items);
    await Promise.all(items.map((item) => this.assertNoPendingRate(item)));
    return this.rateRepo.createMany(items);
  }

  private async assertNoPendingRate(data: CreateExchangeRateData) {
    const existing = await this.rateRepo.findDraftByIdentity(data);
    if (existing) {
      throw new ConflictException(
        `Tỷ giá ${data.rateType} ${data.fromCurrency}/${data.toCurrency} đã có bản DRAFT chờ duyệt`,
      );
    }
  }

  private toData(dto: CreateExchangeRateDto, createdByUserId: string) {
    return {
      rateType: dto.rateType,
      provider: resolveProvider(dto.rateType, dto.provider),
      fromCurrency: dto.fromCurrency,
      toCurrency: dto.toCurrency ?? 'VND',
      buyRate: dto.buyRate ?? null,
      sellRate: dto.sellRate ?? null,
      rate: dto.rate,
      margin: resolveMargin(dto.rateType, dto.margin),
      effectiveFrom: dto.effectiveFrom ? new Date(dto.effectiveFrom) : new Date(),
      createdByUserId,
    };
  }
}

function assertUniqueRateIdentities(items: CreateExchangeRateData[]) {
  const identities = items.map(rateIdentityKey);
  if (new Set(identities).size !== identities.length) {
    throw new BadRequestException('Danh sách có loại tỷ giá và cặp tiền tệ bị trùng');
  }
}

function rateIdentityKey(rate: CreateExchangeRateData) {
  return `${rate.rateType}:${rate.provider ?? ''}:${rate.fromCurrency}:${rate.toCurrency}`;
}

function assertSingleMarginPerFxPair(rates: CreateExchangeRateDto[]) {
  const margins = new Map<string, number>();
  for (const rate of rates) {
    if (rate.rateType !== ExchangeRateType.FX_BUY && rate.rateType !== ExchangeRateType.FX_SELL) continue;
    const key = `${rate.provider ?? ServiceProvider.INTERNAL}:${rate.fromCurrency}:${rate.toCurrency ?? 'VND'}`;
    const margin = rate.margin ?? 0;
    const existing = margins.get(key);
    if (existing !== undefined && existing !== margin) {
      throw new BadRequestException(`Cặp tỷ giá ${rate.fromCurrency}/${rate.toCurrency ?? 'VND'} chỉ được có một biên độ`);
    }
    margins.set(key, margin);
  }
}

function resolveMargin(rateType: ExchangeRateType, margin?: number) {
  if (rateType !== ExchangeRateType.FX_BUY && rateType !== ExchangeRateType.FX_SELL) return 0;
  return margin ?? 0;
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
