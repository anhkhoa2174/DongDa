import { httpClient } from '@/shared/api/httpClient';

export interface WuTransactionDto {
  id: string;
  transactionNo: string;
  branchId: string;
  shiftCode?: string;
  status: string;
  customerName?: string | null;
  customerPhone?: string | null;
  mtcn: string;
  wuUsdAmount: number;
  wuVndAmount: number;
  receivedUsd: number;
  receivedVnd: number;
  wuRate: number;
  systemRate: number;
  appliedRate: number;
  paidCurrency: 'USD' | 'VND';
  payoutCurrency: 'USD' | 'VND';
  profit: number;
  createdAt: string;
}

export interface CreateWuPayload {
  branchId: string;
  mtcn: string;
  customerName?: string;
  wuUsdAmount: number;
  wuVndAmount: number;
  receivedUsd: number;
  receivedVnd: number;
  appliedRate: number;
  payoutCurrency: string;
  paidCurrency: string;
}

export interface BranchRef { id: string; code: string; name: string; type: string; }

export const wuApi = {
  list: (branchId?: string) =>
    httpClient.get<WuTransactionDto[]>('/wu/transactions', { params: { branchId } }).then((r) => r.data),
  create: (payload: CreateWuPayload) =>
    httpClient.post<WuTransactionDto>('/wu/transactions', payload).then((r) => r.data),
  branches: () => httpClient.get<BranchRef[]>('/branches').then((r) => r.data),
};
