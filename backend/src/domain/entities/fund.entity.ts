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

import type { CurrencyCode } from './currency';
export type { CurrencyCode } from './currency';

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
  bankVnd: number;
  bankUsd: number;
  bankValueVnd: number;
  debtVnd: number;
  debtUsd: number;
  debtValueVnd: number;
  branchFundVnd: number;
  branchFundUsd: number;
  branchFundValueVnd: number;
  totalCompanyFundVnd: number;
  weekStartedAt: Date;
  weeklyCapitalChangeVnd: number;
  weeklyCapitalChangePercent: number | null;
  missingRateCurrencies: CurrencyCode[];
}

export type CentralCashMovementDirection = 'IN' | 'OUT';
export type CentralFundSourceType = 'CASH' | 'BANK';

export interface CentralFundMovement {
  voucherNo: string;
  direction: CentralCashMovementDirection;
  sourceType: CentralFundSourceType;
  items: Array<{
    id: string;
    movementNo: string;
    currencyCode: CurrencyCode;
    amount: number;
    bankAccountId?: string;
  }>;
  note?: string | null;
  postedAt: Date;
}

export interface CentralFundConversion {
  voucherNo: string;
  items: Array<{
    currencyCode: CurrencyCode;
    amount: number;
    rate: number;        // Tỷ giá áp dụng
    deduction: number;  // Khấu trừ (VNĐ), mặc định 0
    vndAmount: number;  // = amount × rate - deduction
  }>;
  totalVndAmount: number;
  note?: string | null;
  postedAt: Date;
}

export type FundMovementHistoryKind = 'RECEIPT' | 'EXPENSE' | 'TRANSFER_IN' | 'TRANSFER_OUT';

export interface FundMovementHistoryItem {
  id: string;
  documentNo: string;
  kind: FundMovementHistoryKind;
  sourceType: 'CASH' | 'BANK' | 'FUND_TRANSFER';
  branchId: string;
  counterpartyBranchId?: string | null;
  currencyCode: CurrencyCode;
  amount: number;
  status: string;
  note?: string | null;
  occurredAt: Date;
}
