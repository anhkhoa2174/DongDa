import { httpClient } from '@/shared/api/httpClient';

export type BankMovementType = 'DEPOSIT' | 'WITHDRAW' | 'TRANSFER_IN' | 'TRANSFER_OUT' | 'RECONCILIATION';
export type ManualBankMovementType = Exclude<BankMovementType, 'RECONCILIATION'>;

export interface BankDto {
  id: string;
  code: string;
  name: string;
}

export interface BankAccountDto {
  id: string;
  bankId: string;
  bankCode: string;
  bankName: string;
  branchId: string;
  branchCode?: string;
  branchName?: string;
  accountNo: string;
  accountName: string;
  currencyCode: string;
  currentBalance: number;
  status: 'ACTIVE' | 'INACTIVE';
}

export interface BankMovementDto {
  id: string;
  movementNo: string;
  bankAccountId: string;
  movementType: BankMovementType;
  amount: number;
  currencyCode: string;
  balanceBefore: number;
  balanceAfter: number;
  bankReference?: string | null;
  description?: string | null;
  businessDate: string;
  createdAt: string;
}

export interface DebtAccountDto {
  id: string;
  name: string;
  providerCode: string;
  currencyCode: string;
  outstanding: number;
  status: string;
}

export interface CreateBankAccountInput {
  branchId: string;
  bankCode: string;
  bankName?: string;
  accountNo: string;
  accountName: string;
  currencyCode: string;
  openingBalance?: number;
}

export interface CreateBankMovementInput {
  movementType: ManualBankMovementType;
  amount: number;
  description?: string;
  bankReference?: string;
  counterparty?: string;
  businessDate?: string;
}

export const bankApi = {
  banks: () => httpClient.get<BankDto[]>('/bank/banks').then((r) => r.data),
  accounts: (branchId?: string) =>
    httpClient.get<BankAccountDto[]>('/bank/accounts', { params: branchId ? { branchId } : {} }).then((r) => r.data),
  createAccount: (payload: CreateBankAccountInput) =>
    httpClient.post<BankAccountDto>('/bank/accounts', payload).then((r) => r.data),
  deactivateAccount: (id: string) =>
    httpClient.patch<BankAccountDto>(`/bank/accounts/${id}/deactivate`).then((r) => r.data),
  movements: (bankAccountId?: string) =>
    httpClient.get<BankMovementDto[]>('/bank/movements', { params: { bankAccountId } }).then((r) => r.data),
  createMovement: (bankAccountId: string, payload: CreateBankMovementInput) =>
    httpClient.post<BankMovementDto>(`/bank/accounts/${bankAccountId}/movements`, payload).then((r) => r.data),
  debts: () => httpClient.get<DebtAccountDto[]>('/debts').then((r) => r.data),
  receive: (payload: { bankAccountId: string; debtAccountId: string; amount: number; bankReference?: string; description?: string }) =>
    httpClient.post('/bank/receive', payload).then((r) => r.data),
};
