// Domain Entity: Ngân hàng
// Layer: Domain
//
// bank_accounts lưu current_balance trực tiếp (khác fund_accounts tính từ ledger);
// mọi thay đổi số dư đều phải đi kèm 1 dòng bank_balance_movements (truy vết nguồn).
// Mỗi chi nhánh có tài khoản ngân hàng riêng (branch_id); Hội sở giữ tài khoản chung.
// Flow F7.3: tiền WU/MG về → số dư NH TĂNG + công nợ WU/MG GIẢM (settle).

import type { CurrencyCode } from './currency';
export type { CurrencyCode } from './currency';

export type BankMovementType = 'DEPOSIT' | 'WITHDRAW' | 'TRANSFER_IN' | 'TRANSFER_OUT' | 'RECONCILIATION';

// Loại biến động làm TĂNG số dư; còn lại làm GIẢM.
export const BANK_INFLOW_TYPES: BankMovementType[] = ['DEPOSIT', 'TRANSFER_IN'];

export function isBankInflow(type: BankMovementType): boolean {
  return BANK_INFLOW_TYPES.includes(type);
}

export interface Bank {
  id: string;
  code: string;
  name: string;
}

export interface BankAccount {
  id: string;
  bankId: string;
  bankCode: string;
  bankName: string;
  branchId: string;
  branchCode?: string;
  branchName?: string;
  accountNo: string;
  accountName: string;
  currencyCode: CurrencyCode;
  currentBalance: number;
  status: 'ACTIVE' | 'INACTIVE';
}

export interface BankMovement {
  id: string;
  movementNo: string;
  bankAccountId: string;
  movementType: BankMovementType | string;
  businessDate: Date;
  amount: number;
  currencyCode: CurrencyCode;
  balanceBefore: number;
  balanceAfter: number;
  bankReference?: string | null;
  description?: string | null;
  createdByUserId?: string;
  createdAt: Date;
  // Chỉ có ở phiếu ADVANCE_CK: đã được hoàn (có ADVANCE_SETTLE tham chiếu tới) hay chưa
  settled?: boolean;
  settledMovementId?: string | null;
}
