// Domain Entity: Công nợ (WU/MG)
// Layer: Domain
//
// Mô hình v3: sổ + biến động
//   debt_accounts  = 1 khoản nợ ngày / (ngày + chi nhánh + provider + loại tiền)
//   debt_movements = từng lần tăng (EXPECTED_DEBT) / giảm (SETTLEMENT)
// "Status" công nợ (Pending/Partially/Settled) là GIÁ TRỊ SUY RA từ số dư còn lại.

export enum DebtMovementType {
  EXPECTED_DEBT = 'EXPECTED_DEBT', // nợ phát sinh khi tạo GD WU/MG
  ACTUAL_DEBT = 'ACTUAL_DEBT',
  ADJUSTMENT = 'ADJUSTMENT',
  SETTLEMENT = 'SETTLEMENT', // trả nợ (tiền WU/MG về)
  REVERSAL = 'REVERSAL',
}

import type { CurrencyCode } from './currency';
export type { CurrencyCode } from './currency';

// Trạng thái công nợ (suy ra từ số dư)
export enum DebtStatus {
  PENDING = 'PENDING', // chưa trả đồng nào
  PARTIALLY_SETTLED = 'PARTIALLY_SETTLED', // trả một phần
  SETTLED = 'SETTLED', // trả hết
}

export interface DebtAccount {
  id: string;
  branchId: string;
  providerCode: string; // 'WU' | 'MG'
  currencyCode: CurrencyCode;
  businessDate: Date;
  name: string;
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
  status: DebtStatus;
}

export function computeDebtStatus(totalDebt: number, totalSettled: number): DebtStatus {
  if (totalDebt <= 0) return DebtStatus.PENDING;
  const outstanding = totalDebt - totalSettled;
  if (outstanding <= 0) return DebtStatus.SETTLED;
  if (totalSettled > 0) return DebtStatus.PARTIALLY_SETTLED;
  return DebtStatus.PENDING;
}
