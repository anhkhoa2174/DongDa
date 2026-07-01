export type DebtCurrency = 'USD' | 'VND';

export type DebtStatus = 'OPEN' | 'PARTIAL' | 'OVERDUE' | 'RESOLVED';

export type DebtSource = 'WU' | 'MG' | 'BANK' | 'ADJUSTMENT';

export type DebtRecord = {
  key: string;
  code: string;
  source: DebtSource;
  counterparty: string;
  branch: string;
  currency: DebtCurrency;
  originalAmount: number;
  remainingAmount: number;
  resolvedAmount: number;
  ageInDays: number;
  dueDate: string;
  status: DebtStatus;
  owner: string;
  note: string;
  lastUpdatedAt: string;
};

export type UsdDebtResolutionForm = {
  debtCode: string;
  cashUsdAmount: number;
  bankRate: number;
  oddUsdAmount?: number;
  oddVndAmount?: number;
  reason: string;
};

export type VndDebtResolutionForm = {
  debtCode: string;
  bankAccount: string;
  transferAmount: number;
  referenceCode: string;
  fee?: number;
  reason: string;
};
