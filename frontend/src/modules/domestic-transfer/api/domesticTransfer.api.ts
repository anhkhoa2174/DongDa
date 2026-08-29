import { httpClient } from '@/shared/api/httpClient';

export type DomesticTransferType = 'CASH_TO_BANK' | 'BANK_TO_CASH';

export interface DomesticTransferDto {
  id: string;
  transactionNo: string;
  branchId: string;
  shiftCode?: string;
  status: string;
  transferType: DomesticTransferType;
  customerName?: string | null;
  customerPhone?: string | null;
  bankAccountId: string;
  bankAccountLabel: string;
  counterpartyBank?: string | null;
  counterpartyAccount?: string | null;
  amount: number;
  fee: number;
  cashAmount: number;
  transactionValueVnd: number;
  transferNote?: string | null;
  createdAt: string;
}

export interface DomesticTransferBankAccountDto {
  id: string;
  bankCode: string;
  bankName: string;
  accountNo: string;
  accountName: string;
  currentBalance: number;
}

export interface CreateDomesticTransferPayload {
  branchId: string;
  transferType: DomesticTransferType;
  bankAccountId: string;
  customerName?: string;
  customerPhone?: string;
  counterpartyBank?: string;
  counterpartyAccount?: string;
  transferReference: string;
  amount: number;
  fee: number;
  transferNote?: string;
}

export const domesticTransferApi = {
  list: (branchId?: string) =>
    httpClient.get<DomesticTransferDto[]>('/domestic-transfers', { params: { branchId } }).then((response) => response.data),
  bankAccounts: () =>
    httpClient.get<DomesticTransferBankAccountDto[]>('/domestic-transfers/bank-accounts').then((response) => response.data),
  create: (payload: CreateDomesticTransferPayload) =>
    httpClient.post<DomesticTransferDto>('/domestic-transfers', payload).then((response) => response.data),
  exportForm: (payload: CreateDomesticTransferPayload) =>
    httpClient.post<Blob>('/domestic-transfers/form', payload, { responseType: 'blob' }).then((response) => response.data),
};
