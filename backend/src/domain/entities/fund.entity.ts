// Domain Entity: Quỹ & Tiếp quỹ
// Layer: Domain
//
// Số dư quỹ KHÔNG lưu trực tiếp — tính từ ledger:
//   balance(account) = Σ DEBIT − Σ CREDIT  (của các ledger_lines POSTED)
// Mỗi dòng tiền: CREDIT sổ nguồn (giảm) + DEBIT sổ đích (tăng).
// Toàn bộ dòng của một phiếu được ghi trong cùng 1 ledger_entry và DB transaction.

export enum FundTransferStatus {
  PENDING = 'PENDING_APPROVAL', // đã tạo, chờ bên nhận xác nhận
  CONFIRMED = 'CONFIRMED', // bên nhận đã nhận → số dư đã chuyển
  REJECTED = 'REJECTED', // bên nhận từ chối
  CANCELLED = 'CANCELLED', // bên gửi hủy trước khi xác nhận
}

export type CurrencyCode =
  | 'VND' | 'USD' | 'EUR' | 'AUD' | 'JPY'
  | 'GBP' | 'SGD' | 'THB' | 'CNY' | 'HKD' | 'KRW'
  | 'CAD' | 'CHF' | 'NZD' | 'TWD' | 'MYR' | 'IDR' | 'PHP' | 'LAK' | 'KHR';

export interface FundTransferItem {
  id: string;
  sourceAccountId: string;
  destinationAccountId: string;
  currencyCode: CurrencyCode;
  amount: number;
}

export interface FundTransfer {
  id: string;
  transferNo: string;
  sourceBranchId: string;
  destinationBranchId: string;
  items: FundTransferItem[];
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

export interface CentralFundCurrencyBalance {
  currency: CurrencyCode;
  name: string;
  amount: number;
  buyRate: number;
  vndValue: number;
}

export interface CentralFundSummary {
  calculatedAt: Date;
  lastReconciledAt: Date | null;
  paidBuyRate: number;
  vndCash: number;
  usdCash: number;
  usdCashValueVnd: number;
  fundA: CentralFundCurrencyBalance[];
  fundAValueVnd: number;
  centralCashValueVnd: number;
  bankValueVnd: number;
  debtVnd: number;
  debtUsd: number;
  debtValueVnd: number;
  branchFundValueVnd: number;
  totalCompanyFundVnd: number;
  missingRateCurrencies: CurrencyCode[];
}
