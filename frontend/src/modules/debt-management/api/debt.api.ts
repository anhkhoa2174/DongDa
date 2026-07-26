import { httpClient } from '@/shared/api/httpClient';

export type DebtStatus = 'PENDING' | 'PARTIALLY_SETTLED' | 'SETTLED';

export interface DebtAccountSummaryDto {
  id: string;
  branchId: string;
  providerCode: string;
  currencyCode: string;
  name: string;
  totalDebt: number;
  totalSettled: number;
  outstanding: number;
  status: DebtStatus;
}

export interface DebtMovementDto {
  id: string;
  movementType: string;
  amount: number;
  currencyCode: string;
  description?: string | null;
  businessDate: string;
  effectiveAt: string;
}

export interface BranchRef {
  id: string;
  code: string;
  name: string;
  type: string;
}

export const debtApi = {
  list: (params?: { providerCode?: string; currencyCode?: string }) =>
    httpClient.get<DebtAccountSummaryDto[]>('/debts', { params }).then((r) => r.data),

  movements: (id: string) =>
    httpClient.get<DebtMovementDto[]>(`/debts/${id}/movements`).then((r) => r.data),

  settle: (id: string, amount: number, description?: string) =>
    httpClient.post(`/debts/${id}/settle`, { amount, description }).then((r) => r.data),

  record: (payload: { branchId: string; providerCode: string; currencyCode: string; amount: number; description?: string }) =>
    httpClient.post('/debts/record', payload).then((r) => r.data),

  branches: () => httpClient.get<BranchRef[]>('/branches').then((r) => r.data),
};
