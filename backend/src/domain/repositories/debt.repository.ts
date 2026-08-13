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

export interface SettleUsdCashDebtInput {
  debtAccountId: string;
  cashUsdAmount: number;
  oddUsdAmount: number;
  description?: string;
  createdByUserId: string;
}

export interface SettleVndCashDebtInput {
  debtAccountId: string;
  amount: number;
  description?: string;
  createdByUserId: string;
}

export interface SettleDebtBatchInput {
  debtAccountIds: string[];
  amount: number;
  settlementSource: 'CASH' | 'BANK';
  bankAccountId?: string;
  bankReference?: string;
  description?: string;
  createdByUserId: string;
}

export interface DebtBatchSettlementResult {
  settlementNo: string;
  businessDate: Date;
  providerCode: string;
  currencyCode: CurrencyCode;
  accountCount: number;
  totalAmount: number;
}

export interface ListDebtsFilter {
  branchId?: string;
  providerCode?: string;
  currencyCode?: CurrencyCode;
  businessDate?: Date;
  dateFrom?: Date;
  dateTo?: Date;
}

export interface IDebtRepository {
  // Ghi nhận nợ (tăng) — WU/MG sẽ gọi hàm này; tự tạo sổ nếu chưa có
  recordDebt(input: RecordDebtInput): Promise<DebtMovement>;

  // Giải quyết công nợ phải đồng thời ghi nhận nguồn tiền thực nhận.
  settleUsdCash(input: SettleUsdCashDebtInput): Promise<DebtMovement>;
  settleVndCash(input: SettleVndCashDebtInput): Promise<DebtMovement>;
  settleBatch(input: SettleDebtBatchInput): Promise<DebtBatchSettlementResult>;

  findAccountById(id: string): Promise<DebtAccount | null>;
  getAccountSummary(id: string): Promise<DebtAccountSummary | null>;
  listAccountSummaries(filter?: ListDebtsFilter): Promise<DebtAccountSummary[]>;
  listMovements(accountId: string): Promise<DebtMovement[]>;
}
