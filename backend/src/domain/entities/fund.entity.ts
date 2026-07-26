// Domain Entity: Quỹ & Điều chuyển vốn (Tiếp quỹ)
// Layer: Domain
//
// Số dư quỹ KHÔNG lưu trực tiếp — tính từ ledger:
//   balance(account) = Σ DEBIT − Σ CREDIT  (của các ledger_lines POSTED)
// Điều chuyển: CREDIT sổ nguồn (giảm) + DEBIT sổ đích (tăng) = 1 ledger_entry / 2 lines.

export enum FundTransferStatus {
  PENDING = 'PENDING_APPROVAL', // đã tạo, chờ bên nhận xác nhận
  CONFIRMED = 'CONFIRMED', // bên nhận đã nhận → số dư đã chuyển
  REJECTED = 'REJECTED', // bên nhận từ chối
  CANCELLED = 'CANCELLED', // bên gửi hủy trước khi xác nhận
}

export type CurrencyCode =
  | 'VND' | 'USD' | 'EUR' | 'AUD' | 'JPY'
  | 'GBP' | 'SGD' | 'THB' | 'CNY' | 'HKD' | 'KRW';

export interface FundTransfer {
  id: string;
  transferNo: string;
  sourceBranchId: string;
  destinationBranchId: string;
  sourceAccountId: string;
  destinationAccountId: string;
  currencyCode: CurrencyCode;
  amount: number;
  status: FundTransferStatus;
  createdByUserId: string;
  confirmedByUserId?: string | null;
  createdAt: Date;
  confirmedAt?: Date | null;
}

export interface FundAccountBalance {
  id: string;
  branchId: string;
  code: string;
  name: string;
  accountType: string; // CASH | BANK | FUND_A | DEBT
  currencyCode: CurrencyCode;
  balance: number;
}
