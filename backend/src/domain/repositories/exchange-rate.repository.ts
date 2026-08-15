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

export interface ExchangeRateHistoryFilter {
  status?: RateStatus;
  rateType?: ExchangeRateType;
  rateGroup?: 'PAID' | 'FX' | 'BANK';
  page: number;
  pageSize: number;
  keyword?: string;
  createdFrom?: Date;
  createdToExclusive?: Date;
}

export interface ExchangeRateHistoryItem extends ExchangeRate {
  createdByName: string;
  approvedByName?: string | null;
}

export interface ExchangeRateHistoryResult {
  items: ExchangeRateHistoryGroup[];
  total: number;
  page: number;
  pageSize: number;
}

export interface ExchangeRateHistoryGroup {
  id: string;
  category: 'PAID' | 'FX' | 'BANK';
  fromCurrency: CurrencyCode;
  toCurrency: CurrencyCode;
  createdByName: string;
  createdByUserId: string;
  createdAt: Date;
  buy?: ExchangeRateHistoryItem;
  sell?: ExchangeRateHistoryItem;
  bank?: ExchangeRateHistoryItem;
}

export interface IExchangeRateRepository {
  create(data: CreateExchangeRateData): Promise<ExchangeRate>;
  createMany(data: CreateExchangeRateData[]): Promise<ExchangeRate[]>;
  findById(id: string): Promise<ExchangeRate | null>;
  findMany(filter?: ListRatesFilter): Promise<ExchangeRate[]>;
  findActive(filter?: Omit<ListRatesFilter, 'status'>): Promise<ExchangeRate[]>;
  findHistory(filter: ExchangeRateHistoryFilter): Promise<ExchangeRateHistoryResult>;

  // Duyệt: trong 1 transaction — supersede bản ACTIVE cùng identity rồi set bản này ACTIVE
  approveAndSupersede(id: string, approverUserId: string): Promise<ExchangeRate>;

  reject(id: string): Promise<ExchangeRate>;
}
