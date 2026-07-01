export type TransactionStatus = 'COMPLETED' | 'PENDING' | 'VOID' | 'ADJUSTED';

export type TransactionRecord = {
  key: string;
  code: string;
  status: TransactionStatus;
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
  amountLabel: string;
  vndAmount: number;
  branch: string;
  shiftCode: string;
  createdAt: string;
  status: TransactionStatus;
};
