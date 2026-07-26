// Use Cases: Western Union — Flow WU
// Layer: Application

import { Injectable, Inject } from '@nestjs/common';
import { IWuRepository, ListWuFilter } from '../../../domain/repositories/wu.repository';
import { IExchangeRateRepository } from '../../../domain/repositories/exchange-rate.repository';
import { WuTransaction, Currency2 } from '../../../domain/entities/wu.entity';
import { ExchangeRateType } from '../../../domain/entities/exchange-rate.entity';
import type { CreateWuDto } from '../../dtos/wu/wu.dto';

@Injectable()
export class CreateWuUseCase {
  constructor(
    @Inject('IWuRepository') private readonly wuRepo: IWuRepository,
    @Inject('IExchangeRateRepository') private readonly rateRepo: IExchangeRateRepository,
  ) {}

  async execute(dto: CreateWuDto, createdByUserId: string): Promise<WuTransaction> {
    // Snapshot tỷ giá công ty (PAID_SELL WU USD active) tại thời điểm — hỗ trợ so sánh
    const active = await this.rateRepo.findActive({
      rateType: ExchangeRateType.PAID_SELL,
      fromCurrency: 'USD',
    });
    const systemRate = active[0]?.rate ?? dto.appliedRate;

    return this.wuRepo.create({
      branchId: dto.branchId,
      mtcn: dto.mtcn,
      customerName: dto.customerName,
      wuUsdAmount: dto.wuUsdAmount,
      wuVndAmount: dto.wuVndAmount,
      receivedUsd: dto.receivedUsd,
      receivedVnd: dto.receivedVnd,
      appliedRate: dto.appliedRate,
      systemRate,
      paidCurrency: dto.paidCurrency as Currency2,
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
