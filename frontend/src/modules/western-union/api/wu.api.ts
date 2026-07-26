import { httpClient } from '@/shared/api/httpClient';

export interface WuTransactionDto {
  id: string;
  transactionNo: string;
  branchId: string;
  customerName?: string | null;
  mtcn: string;
  wuUsdAmount: number;
  wuVndAmount: number;
  receivedUsd: number;
  receivedVnd: number;
  wuRate: number;
  systemRate: number;
  appliedRate: number;
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
