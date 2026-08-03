import { httpClient } from '@/shared/api/httpClient';

export type MonitoringPeriod = 'day' | 'month' | 'year';
export type BranchFundStatus = 'NORMAL' | 'LOW_CASH' | 'NEEDS_RECONCILIATION';

export type MonitoringBranchDto = {
  id: string;
  code: string;
  name: string;
  managerName: string | null;
  employeeCount: number;
};

export type CreateBranchPayload = {
  code: string;
  name: string;
  address?: string;
  phone?: string;
};

export type CreatedBranchDto = CreateBranchPayload & {
  id: string;
  type: 'BRANCH';
};

export type FundCurrencyBalanceDto = {
  currency: string;
  name: string;
  amount: number;
  buyRate: number;
  vndValue: number;
};

export type BranchFundsDto = {
  branchId: string;
  vndCash: number;
  usdCash: number;
  usdBuyRate: number;
  fundA: FundCurrencyBalanceDto[];
  fundAValueVnd: number;
  currentFundValueVnd: number;
  openShift: { id: string; code: string; cashier: string; openedAt: string } | null;
  lastCashCountAt: string | null;
  pendingTransferCount: number;
  status: BranchFundStatus;
};

export type BranchActivityDto = {
  branchId: string;
  period: MonitoringPeriod;
  from: string;
  to: string;
  transactionCount: number;
  completedCount: number;
  transactionValueVnd: number;
  moneyInVnd: number;
  moneyOutVnd: number;
  sourceMix: Array<{ source: 'WU' | 'MG' | 'FX' | 'DOMESTIC'; count: number; valueVnd: number }>;
  trend: Array<{
    label: string;
    transactionCount: number;
    transactionValueVnd: number;
    moneyInVnd: number;
    moneyOutVnd: number;
  }>;
};

export const branchMonitoringApi = {
  createBranch: (payload: CreateBranchPayload) =>
    httpClient.post<CreatedBranchDto>('/branches', payload).then((response) => response.data),
  listBranches: () => httpClient.get<MonitoringBranchDto[]>('/branch-monitoring/branches').then((response) => response.data),
  getFunds: (branchId: string) =>
    httpClient.get<BranchFundsDto>(`/branch-monitoring/${branchId}/funds`).then((response) => response.data),
  getActivity: (branchId: string, period: MonitoringPeriod, date: string) =>
    httpClient.get<BranchActivityDto>(`/branch-monitoring/${branchId}/activity`, { params: { period, date } })
      .then((response) => response.data),
};
