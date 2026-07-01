export type FundStatus = 'NORMAL' | 'LOW_CASH' | 'NEEDS_RECONCILIATION';

export type FundACurrencyBalance = {
  currency: string;
  name: string;
  amount: number;
  buyRate: number;
  vndValue: number;
};

export type BranchFund = {
  key: string;
  branchName: string;
  manager: string;
  vndCash: number;
  usdCash: number;
  fundA: FundACurrencyBalance[];
  openShift: {
    code: string;
    cashier: string;
    openedAt: string;
  } | null;
  todayIn: number;
  todayOut: number;
  pendingFundTransfer: number;
  lastCashCountAt: string;
  status: FundStatus;
};

export type CentralFund = {
  vndCash: number;
  usdCash: number;
  bankBalance: number;
  debtVnd: number;
  debtUsd: number;
  fundA: FundACurrencyBalance[];
  lastReconciledAt: string;
};
