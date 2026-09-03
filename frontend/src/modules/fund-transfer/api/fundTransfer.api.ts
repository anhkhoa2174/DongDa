import { httpClient } from '@/shared/api/httpClient';

export type FundTransferStatus = 'PENDING_APPROVAL' | 'CONFIRMED' | 'REJECTED' | 'CANCELLED';

export interface FundTransferLineDto {
  id: string;
  sourceAccountId: string;
  destinationAccountId: string;
  currencyCode: string;
  amount: number;
}

export interface FundTransferDto {
  id: string;
  transferNo: string;
  sourceBranchId: string;
  destinationBranchId: string;
  items: FundTransferLineDto[];
  status: FundTransferStatus;
  createdByUserId: string;
  createdAt: string;
  confirmedAt?: string | null;
}

export interface FundBalanceDto {
  id: string;
  branchId: string;
  code: string;
  name: string;
  accountType: string;
  currencyCode: string;
  balance: number;
}

export interface CreateFundTransferPayload {
  destinationBranchId: string;
  items: Array<{ currencyCode: string; amount: number }>;
}

export const fundApi = {
  balances: (branchId?: string) =>
    httpClient.get<FundBalanceDto[]>('/fund/balances', { params: { branchId } }).then((r) => r.data),
  transfers: () =>
    httpClient.get<FundTransferDto[]>('/fund/transfers').then((r) => r.data),
  create: (payload: CreateFundTransferPayload) =>
    httpClient.post<FundTransferDto>('/fund/transfers', payload).then((r) => r.data),
  confirm: (id: string) =>
    httpClient.patch<FundTransferDto>(`/fund/transfers/${id}/confirm`).then((r) => r.data),
  reject: (id: string) =>
    httpClient.patch<FundTransferDto>(`/fund/transfers/${id}/reject`).then((r) => r.data),
  cancel: (id: string) =>
    httpClient.patch<FundTransferDto>(`/fund/transfers/${id}/cancel`).then((r) => r.data),
};
