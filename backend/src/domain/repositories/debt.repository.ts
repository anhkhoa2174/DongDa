// Repository Interface: Công nợ (Port)
// Layer: Domain

import type {
  DebtAccount, DebtAccountSummary, DebtMovement, CurrencyCode,
} from '../entities/debt.entity';

export interface RecordDebtInput {
  branchId: string;
  providerCode: string; // 'WU' | 'MG'
  currencyCode: CurrencyCode;
  amount: number;
  businessDate?: Date;
  description?: string;
  sourceType?: string;
  sourceId?: string;
  createdByUserId: string;
}

export interface SettleDebtInput {
  debtAccountId: string;
  amount: number;
  businessDate?: Date;
  description?: string;
  createdByUserId: string;
}

export interface ListDebtsFilter {
  branchId?: string;
  providerCode?: string;
  currencyCode?: CurrencyCode;
}

export interface IDebtRepository {
  // Ghi nhận nợ (tăng) — WU/MG sẽ gọi hàm này; tự tạo sổ nếu chưa có
  recordDebt(input: RecordDebtInput): Promise<DebtMovement>;

  // Trả nợ (giảm) — SETTLEMENT
  settle(input: SettleDebtInput): Promise<DebtMovement>;

  findAccountById(id: string): Promise<DebtAccount | null>;
  getAccountSummary(id: string): Promise<DebtAccountSummary | null>;
  listAccountSummaries(filter?: ListDebtsFilter): Promise<DebtAccountSummary[]>;
  listMovements(accountId: string): Promise<DebtMovement[]>;
}
