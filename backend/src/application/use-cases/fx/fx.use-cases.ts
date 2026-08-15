// Use Cases: Mua/Bán ngoại tệ (FX)
// Layer: Application

import { Injectable, Inject, BadRequestException } from '@nestjs/common';
import { IFxRepository, ListFxFilter } from '../../../domain/repositories/fx.repository';
import { FxTransaction, CurrencyCode } from '../../../domain/entities/fx.entity';
import { IExchangeRateRepository } from '../../../domain/repositories/exchange-rate.repository';
import { ExchangeRateType, ServiceProvider } from '../../../domain/entities/exchange-rate.entity';
import type { CreateFxDto } from '../../dtos/fx/fx.dto';

@Injectable()
export class CreateFxUseCase {
  constructor(
    @Inject('IFxRepository') private readonly fxRepo: IFxRepository,
    @Inject('IExchangeRateRepository') private readonly rateRepo: IExchangeRateRepository,
  ) {}

  async execute(dto: CreateFxDto, createdByUserId: string): Promise<FxTransaction> {
    const active = await this.rateRepo.findActive({
      rateType: dto.isBuy ? ExchangeRateType.FX_BUY : ExchangeRateType.FX_SELL,
      provider: ServiceProvider.INTERNAL,
      fromCurrency: dto.fxCurrency as CurrencyCode,
    });
    const rate = active[0]?.rate;
    if (!rate) {
      throw new BadRequestException(`Chưa có tỷ giá ACTIVE ${dto.isBuy ? 'mua' : 'bán'} cho ${dto.fxCurrency}`);
    }

    return this.fxRepo.create({
      branchId: dto.branchId,
      isBuy: dto.isBuy,
      fxCurrency: dto.fxCurrency as CurrencyCode,
      fxAmount: dto.fxAmount,
      rate,
      customerName: dto.customerName,
      createdByUserId,
    });
  }
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
