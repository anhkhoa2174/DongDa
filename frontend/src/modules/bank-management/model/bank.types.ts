export type BankAccountStatus = 'ACTIVE' | 'LOCKED' | 'RECONCILING';

export type BankReconciliationStatus = 'MATCHED' | 'PENDING' | 'MISMATCH';

export type BankAccount = {
  key: string;
  bankCode: 'ACB' | 'MSB' | 'TCB';
  bankName: string;
  accountName: string;
  accountNumber: string;
  currency: 'VND' | 'USD';
  balance: number;
  availableBalance: number;
  pendingIn: number;
  pendingOut: number;
  todayIn: number;
  todayOut: number;
  transactionCountToday: number;
  reconciliationStatus: BankReconciliationStatus;
  status: BankAccountStatus;
  lastReconciledAt: string;
  ownerScope: 'Quỹ Chung' | 'Chi nhánh Nguyễn Chí Thanh' | 'Chi nhánh Xã Đàn';
  purpose: string;
  linkedModules: string[];
};
