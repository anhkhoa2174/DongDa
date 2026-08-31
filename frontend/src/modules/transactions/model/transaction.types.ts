export type TransactionStatus = 'COMPLETED' | 'PENDING' | 'VOID' | 'VOIDED' | 'DEACTIVATED' | 'ADJUSTED';

export type TransactionRecord = {
  key: string;
  code: string;
  status: TransactionStatus;
  debtStatus?: 'PENDING' | 'RECONCILED' | 'SETTLED' | 'CANCELLED';
  shiftCode: string;
  createdAt: string;
  createdBy: string;
  amount?: number;
  vndAmount?: number;
  [key: string]: string | number | undefined;
};

export type TransactionSource = 'WU' | 'MG' | 'FX' | 'DOMESTIC';

export type AggregatedTransaction = {
  key: string;
  code: string;
  source: TransactionSource;
  type: string;
  customerName: string;
  customerPhone: string;
  amountLabel: string;
  vndAmount: number;
  debtLabel?: string;
  branch: string;
  branchId: string;
  shiftCode: string;
  createdAt: string;
  createdAtRaw: string;
  status: TransactionStatus;
  debtStatus?: 'PENDING' | 'RECONCILED' | 'SETTLED' | 'CANCELLED';
  financialData?: {
    wuUsdAmount?: number;
    wuVndAmount?: number;
    paidAmount?: number;
    paidCurrency?: 'USD' | 'VND';
    fxAmount?: number;
    fxCurrency?: string;
    appliedRate?: number;
  };
};
