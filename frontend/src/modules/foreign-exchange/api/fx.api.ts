import { httpClient } from '@/shared/api/httpClient';

export interface FxTransactionDto {
  id: string;
  transactionNo: string;
  branchId: string;
  customerName?: string | null;
  isBuy: boolean;
  fxCurrency: string;
  fxAmount: number;
  rate: number;
  vndAmount: number;
  createdAt: string;
}

export interface FxStockDto { branchId: string; currency: string; balance: number; }
export interface BranchRef { id: string; code: string; name: string; type: string; }

export interface CreateFxPayload {
  branchId: string;
  isBuy: boolean;
  fxCurrency: string;
  fxAmount: number;
  rate: number;
  customerName?: string;
}

export const fxApi = {
  list: (branchId?: string) =>
    httpClient.get<FxTransactionDto[]>('/fx/transactions', { params: { branchId } }).then((r) => r.data),
  stock: (branchId?: string) =>
    httpClient.get<FxStockDto[]>('/fx/stock', { params: { branchId } }).then((r) => r.data),
  create: (payload: CreateFxPayload) =>
    httpClient.post<FxTransactionDto>('/fx/transactions', payload).then((r) => r.data),
  branches: () => httpClient.get<BranchRef[]>('/branches').then((r) => r.data),
};
