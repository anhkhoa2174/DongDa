// Repository Interface: Ngân hàng (Port)
// Layer: Domain

import type { BankAccount, BankMovement } from '../entities/bank.entity';

export interface ReceiveFromProviderInput {
  bankAccountId: string;
  debtAccountId: string; // sổ công nợ WU/MG cần trừ
  amount: number;
  bankReference?: string;
  description?: string;
  createdByUserId: string;
}

// Ghi nhận số CK tạm ứng trong ngày (nhân viên CN ứng trước, cuối ngày hoàn lại)
export interface RecordAdvanceCkInput {
  bankAccountId: string;
  branchId: string;
  amount: number;
  description: string;
  createdByUserId: string;
}

export interface SettleAdvanceCkInput {
  advanceMovementId: string; // ID của movement ADVANCE_CK gốc
  bankAccountId: string;
  settledByUserId: string;
  note?: string;
}

export interface ListAdvancesFilter {
  bankAccountId?: string;
  branchId?: string;
  businessDate?: Date;
  status?: 'ADVANCE_CK' | 'SETTLED'; // chỉ lấy chưa hoàn hoặc tất cả
}

export interface IBankRepository {
  listAccounts(branchId?: string): Promise<BankAccount[]>;
  listMovements(bankAccountId?: string, branchId?: string): Promise<BankMovement[]>;
  // Ghi nhận tiền WU/MG về: NH tăng + công nợ giảm (1 transaction)
  receiveFromProvider(input: ReceiveFromProviderInput): Promise<BankMovement>;
  // Ghi nhận tạm ứng CK hằng ngày
  recordAdvanceCk(input: RecordAdvanceCkInput): Promise<BankMovement>;
  settleAdvanceCk(input: SettleAdvanceCkInput): Promise<BankMovement>;
  listAdvances(filter?: ListAdvancesFilter): Promise<BankMovement[]>;
}

