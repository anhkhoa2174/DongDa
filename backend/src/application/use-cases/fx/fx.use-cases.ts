// Use Cases: Mua/Bán ngoại tệ (FX)
// Layer: Application

import { Injectable, Inject } from '@nestjs/common';
import { IFxRepository, ListFxFilter } from '../../../domain/repositories/fx.repository';
import { FxTransaction, CurrencyCode } from '../../../domain/entities/fx.entity';
import type { CreateFxDto } from '../../dtos/fx/fx.dto';

@Injectable()
export class CreateFxUseCase {
  constructor(@Inject('IFxRepository') private readonly fxRepo: IFxRepository) {}
  execute(dto: CreateFxDto, createdByUserId: string): Promise<FxTransaction> {
    return this.fxRepo.create({
      branchId: dto.branchId,
      isBuy: dto.isBuy,
      fxCurrency: dto.fxCurrency as CurrencyCode,
      fxAmount: dto.fxAmount,
      rate: dto.rate,
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
