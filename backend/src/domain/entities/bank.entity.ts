// Domain Entity: Ngân hàng
// Layer: Domain
//
// bank_accounts lưu current_balance trực tiếp (khác fund_accounts tính từ ledger).
// Flow F7.3: tiền WU/MG về → số dư NH TĂNG + công nợ WU/MG GIẢM (settle).

export type CurrencyCode =
  | 'VND' | 'USD' | 'EUR' | 'AUD' | 'JPY'
  | 'GBP' | 'SGD' | 'THB' | 'CNY' | 'HKD' | 'KRW';

export interface BankAccount {
  id: string;
  bankCode: string;
  bankName: string;
  branchId: string;
  accountNo: string;
  accountName: string;
  currencyCode: CurrencyCode;
  currentBalance: number;
}

export interface BankMovement {
  id: string;
  movementNo: string;
  bankAccountId: string;
  movementType: string;
  businessDate: Date;
  amount: number;
  currencyCode: CurrencyCode;
  balanceBefore: number;
  balanceAfter: number;
  bankReference?: string | null;
  description?: string | null;
  createdAt: Date;
}
