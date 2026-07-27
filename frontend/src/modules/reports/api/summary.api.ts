import { httpClient } from '@/shared/api/httpClient';

export interface ProviderStat { count: number; totalUsd: number; totalVnd: number; profit: number; }
export interface SummaryDto {
  transactions: {
    wu: ProviderStat;
    mg: ProviderStat;
    fx: { buyCount: number; sellCount: number; buyVnd: number; sellVnd: number };
  };
  cash: { vnd: number; usd: number };
  fundA: { currency: string; balance: number }[];
  bank: {
    accounts: { bankCode: string; currency: string; balance: number }[];
    totalVnd: number; totalUsd: number;
  };
  debt: {
    items: { provider: string; currency: string; outstanding: number; status: string }[];
    wuOutstandingUsd: number; mgOutstandingUsd: number;
  };
  alerts: { type: string; level: string; message: string }[];
}

export const summaryApi = {
  get: () => httpClient.get<SummaryDto>('/reports/summary').then((r) => r.data),
};
