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
  bankVnd: number;
  bankUsd: number;
  bankValueVnd: number;
  debtVnd: number;
  debtUsd: number;
  debtValueVnd: number;
  branchFundVnd: number;
  branchFundUsd: number;
  branchFundValueVnd: number;
  totalCompanyFundVnd: number;
  weekStartedAt: string;
  weeklyCapitalChangeVnd: number;
  weeklyCapitalChangePercent: number | null;
  missingRateCurrencies: string[];
}

export interface CreateCentralFundMovementPayload {
  direction: 'IN' | 'OUT';
  sourceType: 'CASH' | 'BANK';
  items: Array<{
    currencyCode: string;
    amount: number;
    bankAccountId?: string;
  }>;
  note?: string;
}

export interface CentralFundMovementDto extends CreateCentralFundMovementPayload {
  voucherNo: string;
  items: Array<CreateCentralFundMovementPayload['items'][number] & {
    id: string;
    movementNo: string;
  }>;
  postedAt: string;
}

export interface CentralFundConversionDto {
  voucherNo: string;
  items: Array<{
    currencyCode: string;
    amount: number;
    rate: number;
    grossVndAmount: number;
    deduction: number;
    vndAmount: number;
  }>;
  totalVndAmount: number;
  note?: string | null;
  postedAt: string;
}

export interface FundMovementHistoryDto {
  id: string;
  documentNo: string;
  kind: 'RECEIPT' | 'EXPENSE' | 'TRANSFER_IN' | 'TRANSFER_OUT';
  sourceType: 'CASH' | 'BANK' | 'FUND_TRANSFER';
  branchId: string;
  counterpartyBranchId?: string | null;
  currencyCode: string;
  amount: number;
  status: string;
  note?: string | null;
  occurredAt: string;
}

export const centralFundApi = {
  getSummary: () => httpClient
    .get<CentralFundSummaryDto>('/fund/central-summary')
    .then((response) => response.data),
  createMovement: (payload: CreateCentralFundMovementPayload) => httpClient
    .post<CentralFundMovementDto>('/fund/central-movements', payload)
    .then((response) => response.data),
  createBranchMovement: (payload: CreateCentralFundMovementPayload) => httpClient
    .post<CentralFundMovementDto>('/fund/branch-movements', payload)
    .then((response) => response.data),
  convertFundA: (payload: {
    items: Array<{ currencyCode: string; amount: number; rate: number; deduction: number }>;
    note?: string;
  }) => httpClient
    .post<CentralFundConversionDto>('/fund/central-conversions', payload)
    .then((response) => response.data),
  getMovementHistory: (branchId?: string) => httpClient
    .get<FundMovementHistoryDto[]>('/fund/movement-history', { params: { branchId } })
    .then((response) => response.data),
};
