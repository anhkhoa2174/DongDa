export type CashCountType = 'OPEN_SHIFT' | 'CLOSE_SHIFT' | 'AUDIT';
export type CashCountStatus = 'DRAFT' | 'SUBMITTED' | 'APPROVED' | 'DISPUTED';

export type Denomination = {
  value: number;
  count: number;
};

export type CashCountRecord = {
  id: string;
  branchCode: string;
  branchName: string;
  type: CashCountType;
  performedBy: string;
  performedAt: string;
  status: CashCountStatus;
  currency: 'VND' | 'USD';
  expected: number;
  actual: number;
  difference: number;
  denominations: Denomination[];
  note?: string;
};

export type CentralAuditRecord = {
  id: string;
  branchCode: string;
  branchName: string;
  reportedTotal: number;
  centralExpected: number;
  gap: number;
  currency: 'VND' | 'USD';
  performedAt: string;
  status: 'MATCHED' | 'PENDING' | 'MISMATCH';
};
