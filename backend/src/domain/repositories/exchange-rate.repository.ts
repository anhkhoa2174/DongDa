// Repository Interface: ExchangeRate (Port)
// Layer: Domain

import type {
  ExchangeRate,
  ExchangeRateType,
  RateStatus,
  ServiceProvider,
  CurrencyCode,
} from '../entities/exchange-rate.entity';

export interface CreateExchangeRateData {
  rateType: ExchangeRateType;
  provider?: ServiceProvider | null;
  fromCurrency: CurrencyCode;
  toCurrency: CurrencyCode;
  buyRate?: number | null;
  sellRate?: number | null;
  rate: number;
  effectiveFrom: Date;
  createdByUserId: string;
}

export interface ListRatesFilter {
  status?: RateStatus;
  rateType?: ExchangeRateType;
  provider?: ServiceProvider;
  fromCurrency?: CurrencyCode;
}

export interface IExchangeRateRepository {
  create(data: CreateExchangeRateData): Promise<ExchangeRate>;
  findById(id: string): Promise<ExchangeRate | null>;
  findMany(filter?: ListRatesFilter): Promise<ExchangeRate[]>;
  findActive(filter?: Omit<ListRatesFilter, 'status'>): Promise<ExchangeRate[]>;

  // Duyệt: trong 1 transaction — supersede bản ACTIVE cùng identity rồi set bản này ACTIVE
  approveAndSupersede(id: string, approverUserId: string): Promise<ExchangeRate>;

  reject(id: string): Promise<ExchangeRate>;
}
