import { httpClient } from '@/shared/api/httpClient';

export interface BankAccountDto {
  id: string;
  bankCode: string;
  bankName: string;
  branchId: string;
  accountNo: string;
  accountName: string;
  currencyCode: string;
  currentBalance: number;
}

export interface BankMovementDto {
  id: string;
  movementNo: string;
  bankAccountId: string;
  movementType: string;
  amount: number;
  currencyCode: string;
  balanceBefore: number;
  balanceAfter: number;
  bankReference?: string | null;
  description?: string | null;
  businessDate: string;
}

export interface DebtAccountDto {
  id: string;
  name: string;
  providerCode: string;
  currencyCode: string;
  outstanding: number;
  status: string;
}

export const bankApi = {
  accounts: () => httpClient.get<BankAccountDto[]>('/bank/accounts').then((r) => r.data),
  movements: (bankAccountId?: string) =>
    httpClient.get<BankMovementDto[]>('/bank/movements', { params: { bankAccountId } }).then((r) => r.data),
  debts: () => httpClient.get<DebtAccountDto[]>('/debts').then((r) => r.data),
  receive: (payload: { bankAccountId: string; debtAccountId: string; amount: number; bankReference?: string }) =>
    httpClient.post('/bank/receive', payload).then((r) => r.data),
};
