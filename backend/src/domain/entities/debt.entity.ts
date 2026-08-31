// Domain Entity: Công nợ (WU/MG)
// Layer: Domain
//
// Mô hình v4: một giao dịch WU/MG có đúng một công nợ.
// Công nợ chỉ được thanh toán toàn bộ sau khi đối chiếu hai lớp hoàn tất.

export enum DebtMovementType {
  EXPECTED_DEBT = 'EXPECTED_DEBT', // nợ phát sinh khi tạo GD WU/MG
  ACTUAL_DEBT = 'ACTUAL_DEBT',
  ADJUSTMENT = 'ADJUSTMENT',
  SETTLEMENT = 'SETTLEMENT', // trả nợ (tiền WU/MG về)
  REVERSAL = 'REVERSAL',
}

import type { CurrencyCode } from './currency';
export type { CurrencyCode } from './currency';

export enum DebtStatus {
  PENDING = 'PENDING',
  RECONCILED = 'RECONCILED',
  SETTLED = 'SETTLED',
  CANCELLED = 'CANCELLED',
}

export interface DebtAccount {
  id: string;
  transactionId?: string | null;
  reconciliationRunId?: string | null;
  settlementBankAccountId?: string | null;
  branchId: string;
  providerCode: string; // 'WU' | 'MG'
  currencyCode: CurrencyCode;
  businessDate: Date;
  name: string;
  status: DebtStatus;
  reconciledAt?: Date | null;
  settledAt?: Date | null;
  cancelledAt?: Date | null;
}

export interface DebtMovement {
  id: string;
  debtAccountId: string;
  branchId: string;
  movementType: DebtMovementType;
  sourceType?: string | null;
  sourceId?: string | null;
  businessDate: Date;
  effectiveAt: Date;
  amount: number;
  currencyCode: CurrencyCode;
  description?: string | null;
  createdByUserId: string;
  createdAt: Date;
}

// Tổng hợp 1 sổ nợ: tổng nợ, đã trả, còn lại, trạng thái
export interface DebtAccountSummary extends DebtAccount {
  totalDebt: number;
  totalSettled: number;
  outstanding: number;
}
