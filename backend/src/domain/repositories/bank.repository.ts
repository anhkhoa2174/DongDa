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

export interface IBankRepository {
  listAccounts(): Promise<BankAccount[]>;
  listMovements(bankAccountId?: string): Promise<BankMovement[]>;
  // Ghi nhận tiền WU/MG về: NH tăng + công nợ giảm (1 transaction)
  receiveFromProvider(input: ReceiveFromProviderInput): Promise<BankMovement>;
}
