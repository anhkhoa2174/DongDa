// Use Case: Liệt kê tỷ giá (lịch sử / theo trạng thái) và lấy tỷ giá ACTIVE
// Layer: Application

import { Injectable, Inject } from '@nestjs/common';
import {
  IExchangeRateRepository,
  ListRatesFilter,
} from '../../../domain/repositories/exchange-rate.repository';
import { ExchangeRate } from '../../../domain/entities/exchange-rate.entity';

@Injectable()
export class ListExchangeRatesUseCase {
  constructor(
    @Inject('IExchangeRateRepository')
    private readonly rateRepo: IExchangeRateRepository,
  ) {}

  list(filter?: ListRatesFilter): Promise<ExchangeRate[]> {
    return this.rateRepo.findMany(filter);
  }

  active(filter?: Omit<ListRatesFilter, 'status'>): Promise<ExchangeRate[]> {
    return this.rateRepo.findActive(filter);
  }
}
