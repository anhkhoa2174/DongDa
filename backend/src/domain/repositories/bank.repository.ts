// Repository Interface: Ngân hàng (Port)
// Layer: Domain

import type { Bank, BankAccount, BankMovement, BankMovementType, CurrencyCode } from '../entities/bank.entity';

export interface ReceiveFromProviderInput {
  bankAccountId: string;
  debtAccountId: string; // sổ công nợ WU/MG cần trừ
  amount: number;
  bankReference?: string;
  description?: string;
  createdByUserId: string;
}

export interface CreateBankAccountInput {
  branchId: string;
  bankCode: string; // ACB, MSB... — chưa có thì tạo mới bank theo code + name
  bankName?: string;
  accountNo: string;
  accountName: string;
  currencyCode: CurrencyCode;
  openingBalance?: number; // > 0 -> ghi 1 biến động DEPOSIT "Số dư đầu kỳ" để truy vết
  createdByUserId: string;
}

export interface CreateBankMovementInput {
  bankAccountId: string;
  movementType: BankMovementType; // DEPOSIT/TRANSFER_IN tăng; WITHDRAW/TRANSFER_OUT giảm
  amount: number;
  description?: string;
  bankReference?: string;
  counterparty?: string; // đối tác chuyển/nhận (khách hàng, ngân hàng khác...)
  businessDate?: Date;
  createdByUserId: string;
}

// Tạm ứng CK hằng ngày (nhân viên CN ứng trước, cuối ngày hoàn lại)
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
  status?: 'ADVANCE_CK' | 'SETTLED';
}

export interface IBankRepository {
  listBanks(): Promise<Bank[]>;
  listAccounts(branchId?: string, includeInactive?: boolean): Promise<BankAccount[]>;
  findAccount(id: string): Promise<BankAccount | null>;
  createAccount(input: CreateBankAccountInput): Promise<BankAccount>;
  deactivateAccount(id: string): Promise<BankAccount>;
  listMovements(bankAccountId?: string, branchId?: string): Promise<BankMovement[]>;
  // Nộp/rút/chuyển khoản thủ công: cập nhật số dư + ghi 1 dòng biến động (1 transaction)
  createMovement(input: CreateBankMovementInput): Promise<BankMovement>;
  // Ghi nhận tiền WU/MG về: NH tăng + công nợ giảm (1 transaction)
  receiveFromProvider(input: ReceiveFromProviderInput): Promise<BankMovement>;
  // Tạm ứng CK hằng ngày
  recordAdvanceCk(input: RecordAdvanceCkInput): Promise<BankMovement>;
  settleAdvanceCk(input: SettleAdvanceCkInput): Promise<BankMovement>;
  listAdvances(filter?: ListAdvancesFilter): Promise<BankMovement[]>;
}
