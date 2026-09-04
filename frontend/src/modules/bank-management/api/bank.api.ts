import { httpClient } from '@/shared/api/httpClient';
import { runIdempotent } from '@/shared/utils/idempotency';

export type BankMovementType = 'DEPOSIT' | 'WITHDRAW' | 'TRANSFER_IN' | 'TRANSFER_OUT' | 'RECONCILIATION' | 'ADVANCE_CK' | 'ADVANCE_SETTLE';
export type ManualBankMovementType = 'DEPOSIT' | 'WITHDRAW' | 'TRANSFER_IN' | 'TRANSFER_OUT';

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
  // chỉ có ở phiếu ADVANCE_CK
  settled?: boolean;
  settledMovementId?: string | null;
  settledAt?: string | null;
  settledDescription?: string | null;
  voided?: boolean;
  voidedAt?: string | null;
  voidReason?: string | null;
  settlementSource?: {
    type: 'HEAD_OFFICE_CASH' | 'BANK_ACCOUNT';
    label: string;
    balanceBefore: number;
    balanceAfter: number;
  };
}

export interface InternalBankTransferInput {
  fromBankAccountId: string;
  toBankAccountId: string;
  amount: number;
  description?: string;
  bankReference?: string;
  businessDate?: string;
}

export interface InternalBankTransferResult {
  transferReference: string;
  fromMovement: BankMovementDto;
  toMovement: BankMovementDto;
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
  branchId?: string; // bỏ trống = tài khoản dùng chung toàn công ty (Hội sở)
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
    runIdempotent(`BANK_MOVEMENT_CREATE:${bankAccountId}`, payload, (headers) =>
      httpClient.post<BankMovementDto>(`/bank/accounts/${bankAccountId}/movements`, payload, { headers }).then((r) => r.data)),
  internalTransfer: (payload: InternalBankTransferInput) =>
    runIdempotent('BANK_INTERNAL_TRANSFER', payload, (headers) =>
      httpClient.post<InternalBankTransferResult>('/bank/internal-transfer', payload, { headers }).then((r) => r.data)),
  advances: (params: { bankAccountId?: string; branchId?: string; status?: 'ADVANCE_CK' | 'SETTLED' | 'VOIDED' }) =>
    httpClient.get<BankMovementDto[]>('/bank/advances', { params }).then((r) => r.data),
  settleAdvanceCk: (advanceId: string, payload: { source: 'HEAD_OFFICE_CASH' | 'BANK_ACCOUNT'; sourceBankAccountId?: string; note?: string }) =>
    runIdempotent(`BANK_ADVANCE_SETTLE:${advanceId}`, payload, (headers) =>
      httpClient.post<BankMovementDto>(`/bank/advance-ck/${advanceId}/settle`, payload, { headers }).then((r) => r.data)),
  debts: () => httpClient.get<DebtAccountDto[]>('/debts').then((r) => r.data),
  receive: (payload: { bankAccountId: string; debtAccountId: string; amount: number; bankReference?: string; description?: string }) =>
    httpClient.post('/bank/receive', payload).then((r) => r.data),
};
