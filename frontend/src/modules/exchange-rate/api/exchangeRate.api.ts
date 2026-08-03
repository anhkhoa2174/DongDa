import { httpClient } from '@/shared/api/httpClient';

export type RateStatus = 'DRAFT' | 'ACTIVE' | 'SUPERSEDED' | 'REJECTED';
export type ExchangeRateType =
  | 'PAID_BUY' | 'PAID_SELL' | 'BANK_RATE' | 'WU_SYSTEM' | 'WU_PROVIDER' | 'MG_SYSTEM' | 'FX_BUY' | 'FX_SELL';
export type ServiceProvider = 'WU_MG' | 'WU' | 'MG' | 'BANK' | 'INTERNAL';
export type ListRatesParams = { status?: RateStatus; rateType?: ExchangeRateType; provider?: ServiceProvider };

export interface ExchangeRateHistoryParams {
  status?: RateStatus;
  rateType?: ExchangeRateType;
  from?: string;
  to?: string;
  keyword?: string;
  page: number;
  pageSize: number;
}

export interface ExchangeRateDto {
  id: string;
  rateType: ExchangeRateType;
  provider?: ServiceProvider | null;
  fromCurrency: string;
  toCurrency: string;
  buyRate?: number | null;
  sellRate?: number | null;
  rate: number;
  effectiveFrom: string;
  effectiveTo?: string | null;
  status: RateStatus;
  createdByUserId: string;
  approvedByUserId?: string | null;
  approvedAt?: string | null;
  createdAt: string;
}

export interface ExchangeRateHistoryDto extends ExchangeRateDto {
  createdByName: string;
  approvedByName?: string | null;
}

export interface ExchangeRateHistoryResponse {
  items: ExchangeRateHistoryDto[];
  total: number;
  page: number;
  pageSize: number;
}

export interface CreateRatePayload {
  rateType: ExchangeRateType;
  provider?: ServiceProvider;
  fromCurrency: string | string[];
  toCurrency?: string;
  buyRate?: number;
  sellRate?: number;
  rate: number;
}

export const exchangeRateApi = {
  list: (params?: ListRatesParams) =>
    httpClient.get<ExchangeRateDto[]>('/exchange-rates', { params }).then((r) => r.data),

  active: () =>
    httpClient.get<ExchangeRateDto[]>('/exchange-rates/active').then((r) => r.data),

  history: (params: ExchangeRateHistoryParams) =>
    httpClient.get<ExchangeRateHistoryResponse>('/exchange-rates/history', { params }).then((r) => r.data),

  create: (payload: CreateRatePayload) =>
    httpClient.post<ExchangeRateDto>('/exchange-rates', payload).then((r) => r.data),

  approve: (id: string) =>
    httpClient.patch<ExchangeRateDto>(`/exchange-rates/${id}/approve`).then((r) => r.data),

  reject: (id: string) =>
    httpClient.patch<ExchangeRateDto>(`/exchange-rates/${id}/reject`).then((r) => r.data),
};
