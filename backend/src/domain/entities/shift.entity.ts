// Domain Entity: Ca làm việc + Kiểm quỹ
// Layer: Domain
//
// Mở ca: kiểm quỹ đầu ca (đếm tiền thực tế). Mọi GD WU/MG/FX phải thuộc ca đang mở.
// Đóng ca: kiểm quỹ cuối ca → so tồn hệ thống (ledger) vs tồn thực tế → khớp/thừa/thiếu.

import type { CurrencyCode } from './currency';
export type { CurrencyCode } from './currency';

export interface Shift {
  id: string;
  branchId: string;
  shiftCode: string;
  businessDate: Date;
  status: string; // OPEN | ACTIVE | CLOSED ...
  openedByUserId: string;
  openedAt: Date;
  closedByUserId?: string | null;
  closedAt?: Date | null;
}

// 1 dòng kiểm quỹ: 1 loại tiền, tồn hệ thống vs thực đếm
export interface CashCountLine {
  currencyCode: CurrencyCode;
  systemAmount: number;
  actualAmount: number;
  variance: number; // actual - system  (>0 thừa, <0 thiếu, =0 khớp)
  denominations?: DenominationCount[];
}

export interface DenominationCount {
  denomination: number;
  quantity: number;
  amount: number;
}

export interface CashCount {
  id: string;
  shiftId: string;
  branchId: string;
  countedAt: Date;
  lines: CashCountLine[];
}

export interface CountInput {
  currency: CurrencyCode;
  actualAmount: number;
  denominations?: Array<Pick<DenominationCount, 'denomination' | 'quantity'>>;
}

export function varianceLabel(v: number): 'KHỚP' | 'THỪA' | 'THIẾU' {
  if (Math.abs(v) < 0.01) return 'KHỚP';
  return v > 0 ? 'THỪA' : 'THIẾU';
}
