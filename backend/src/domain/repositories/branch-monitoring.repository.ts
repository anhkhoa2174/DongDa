export type MonitoringPeriod = 'day' | 'month' | 'year';

export interface MonitoringBranch {
  id: string;
  code: string;
  name: string;
  managerName: string | null;
  employeeCount: number;
}

export interface FundCurrencyBalance {
  currency: string;
  name: string;
  amount: number;
  buyRate: number;
  vndValue: number;
}

export interface BranchFundMonitoring {
  branchId: string;
  vndCash: number;
  usdCash: number;
  usdBuyRate: number;
  fundA: FundCurrencyBalance[];
  fundAValueVnd: number;
  currentFundValueVnd: number;
  openShift: {
    id: string;
    code: string;
    cashier: string;
    openedAt: Date;
  } | null;
  lastCashCountAt: Date | null;
  pendingTransferCount: number;
  status: 'NORMAL' | 'LOW_CASH' | 'NEEDS_RECONCILIATION';
}

export interface BranchActivityMonitoring {
  branchId: string;
  period: MonitoringPeriod;
  from: Date;
  to: Date;
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
}

export interface IBranchMonitoringRepository {
  listBranches(): Promise<MonitoringBranch[]>;
  getFunds(branchId: string): Promise<BranchFundMonitoring>;
  getActivity(branchId: string, period: MonitoringPeriod, anchorDate: Date): Promise<BranchActivityMonitoring>;
}
