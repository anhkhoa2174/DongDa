import { httpClient } from '@/shared/api/httpClient';

export interface MgTransactionDto {
  id: string;
  transactionNo: string;
  branchId: string;
  shiftCode?: string;
  status: string;
  customerName?: string | null;
  customerPhone?: string | null;
  referenceNo: string;
  mgUsdAmount: number;
  mgVndAmount: number;
  payoutCurrency: string;
  payoutAmount: number;
  receivedUsd: number;
  receivedVnd: number;
  mgRate: number;
  appliedRate: number;
  profit: number;
  createdAt: string;
}

export interface CreateMgPayload {
  branchId: string;
  referenceNo: string;
  customerName?: string;
  mgUsdAmount: number;
  mgVndAmount: number;
  payoutCurrency: string;
  payoutAmount: number;
  receivedUsd: number;
  receivedVnd: number;
  appliedRate: number;
  paidCurrency: string;
}

export interface BranchRef { id: string; code: string; name: string; type: string; }

export const mgApi = {
  list: (branchId?: string) =>
    httpClient.get<MgTransactionDto[]>('/mg/transactions', { params: { branchId } }).then((r) => r.data),
  create: (payload: CreateMgPayload) =>
    httpClient.post<MgTransactionDto>('/mg/transactions', payload).then((r) => r.data),
  branches: () => httpClient.get<BranchRef[]>('/branches').then((r) => r.data),
};
