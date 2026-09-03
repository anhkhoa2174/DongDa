// Use Cases: Mua/Bán ngoại tệ (FX)
// Layer: Application

import { Injectable, Inject, BadRequestException } from '@nestjs/common';
import { IFxRepository, ListFxFilter } from '../../../domain/repositories/fx.repository';
import { calculateFxVndAmount, FxTransaction, CurrencyCode } from '../../../domain/entities/fx.entity';
import { IExchangeRateRepository } from '../../../domain/repositories/exchange-rate.repository';
import { ExchangeRateType, ServiceProvider } from '../../../domain/entities/exchange-rate.entity';
import type { CreateFxDto } from '../../dtos/fx/fx.dto';

@Injectable()
export class CreateFxUseCase {
  constructor(
    @Inject('IFxRepository') private readonly fxRepo: IFxRepository,
    @Inject('IExchangeRateRepository') private readonly rateRepo: IExchangeRateRepository,
  ) {}

  async execute(dto: CreateFxDto, createdByUserId: string, idempotencyKey: string): Promise<FxTransaction> {
    const active = await this.rateRepo.findActive({
      rateType: dto.isBuy ? ExchangeRateType.FX_BUY : ExchangeRateType.FX_SELL,
      provider: ServiceProvider.INTERNAL,
      fromCurrency: dto.fxCurrency as CurrencyCode,
    });
    const systemRate = active[0]?.rate;
    if (!systemRate) {
      throw new BadRequestException(`Chưa có tỷ giá ACTIVE ${dto.isBuy ? 'mua' : 'bán'} cho ${dto.fxCurrency}`);
    }
    const rate = validateFxAppliedRate(dto.rate, systemRate, active[0]?.margin ?? 0, dto.isBuy);
    const fractionalAmount = Number(dto.fractionalAmount ?? 0);
    const deductionVnd = Math.round(Number(dto.deductionVnd ?? 0));
    if (dto.isBuy && !Number.isInteger(dto.fxAmount)) {
      throw new BadRequestException('Số lượng mua phần nguyên phải là số nguyên; phần lẻ nhập ở ô riêng');
    }
    if (!dto.isBuy && (fractionalAmount > 0 || deductionVnd > 0)) {
      throw new BadRequestException('Phần lẻ và khấu trừ chỉ áp dụng khi mua ngoại tệ');
    }
    const fxAmount = dto.fxAmount + fractionalAmount;
    if (!Number.isFinite(fxAmount) || fxAmount <= 0) {
      throw new BadRequestException('Tổng số lượng ngoại tệ phải lớn hơn 0');
    }
    const amounts = calculateFxVndAmount({
      fxAmount,
      fractionalAmount,
      rate,
      fractionalRate: rate,
      deductionVnd,
    });
    if (amounts.vndAmount <= 0) {
      throw new BadRequestException('Khấu trừ phải nhỏ hơn thành tiền mua ngoại tệ');
    }

    return this.fxRepo.create({
      idempotencyKey,
      branchId: dto.branchId,
      isBuy: dto.isBuy,
      fxCurrency: dto.fxCurrency as CurrencyCode,
      fxAmount,
      fractionalAmount,
      fractionalRate: dto.isBuy ? rate : undefined,
      deductionVnd,
      rate,
      customerName: dto.customerName,
      createdByUserId,
    });
  }
}

export function validateFxAppliedRate(value: number, systemRate: number, margin: number, isBuy: boolean) {
  if (!Number.isFinite(value) || value <= 0) {
    throw new BadRequestException('Tỷ giá giao dịch phải là số dương hợp lệ');
  }
  const safeMargin = Number.isFinite(margin) && margin > 0 ? margin : 0;
  const min = isBuy ? Math.max(systemRate - safeMargin, Number.EPSILON) : systemRate;
  const max = isBuy ? systemRate : systemRate + safeMargin;
  const tolerance = 0.000001;
  if (value < min - tolerance || value > max + tolerance) {
    throw new BadRequestException(
      `Tỷ giá ${isBuy ? 'mua' : 'bán'} phải nằm trong biên ${min} - ${max}`,
    );
  }
  return value;
}

@Injectable()
export class ListFxUseCase {
  constructor(@Inject('IFxRepository') private readonly fxRepo: IFxRepository) {}
  list(filter?: ListFxFilter): Promise<FxTransaction[]> {
    return this.fxRepo.list(filter);
  }
  stock(branchId?: string) {
    return this.fxRepo.currencyStock(branchId);
  }
}
