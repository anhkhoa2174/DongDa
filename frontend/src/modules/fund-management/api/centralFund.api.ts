import { httpClient } from '@/shared/api/httpClient';

export interface CentralFundCurrencyBalanceDto {
  currency: string;
  name: string;
  amount: number;
  buyRate: number;
  vndValue: number;
}

export interface CentralFundSummaryDto {
  calculatedAt: string;
  lastReconciledAt: string | null;
  paidBuyRate: number;
  vndCash: number;
  usdCash: number;
  usdCashValueVnd: number;
  fundA: CentralFundCurrencyBalanceDto[];
  fundAValueVnd: number;
  centralCashValueVnd: number;
  bankValueVnd: number;
  debtVnd: number;
  debtUsd: number;
  debtValueVnd: number;
  branchFundValueVnd: number;
  totalCompanyFundVnd: number;
  missingRateCurrencies: string[];
}

export const centralFundApi = {
  getSummary: () => httpClient
    .get<CentralFundSummaryDto>('/fund/central-summary')
    .then((response) => response.data),
};
