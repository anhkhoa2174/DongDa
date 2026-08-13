// Use Case: Liệt kê tỷ giá (lịch sử / theo trạng thái) và lấy tỷ giá ACTIVE
// Layer: Application

import { Injectable, Inject } from '@nestjs/common';
import {
  IExchangeRateRepository,
  ListRatesFilter,
  ExchangeRateHistoryResult,
} from '../../../domain/repositories/exchange-rate.repository';
import { ExchangeRate } from '../../../domain/entities/exchange-rate.entity';
import { ExchangeRateHistoryQueryDto } from '../../dtos/exchange-rate/exchange-rate.dto';

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

  history(query: ExchangeRateHistoryQueryDto): Promise<ExchangeRateHistoryResult> {
    return this.rateRepo.findHistory({
      status: query.status,
      rateType: query.rateType,
      rateGroup: query.rateGroup,
      keyword: query.keyword,
      createdFrom: query.from ? vietnamDayStart(query.from) : undefined,
      createdToExclusive: query.to ? vietnamNextDayStart(query.to) : undefined,
      page: query.page,
      pageSize: query.pageSize,
    });
  }
}

function vietnamDayStart(value: string): Date {
  return new Date(`${value.slice(0, 10)}T00:00:00+07:00`);
}

function vietnamNextDayStart(value: string): Date {
  const date = vietnamDayStart(value);
  date.setUTCDate(date.getUTCDate() + 1);
  return date;
}
