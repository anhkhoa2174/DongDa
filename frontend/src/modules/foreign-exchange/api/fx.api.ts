import { httpClient } from '@/shared/api/httpClient';
import { runIdempotent } from '@/shared/utils/idempotency';

export interface FxTransactionDto {
  id: string;
  transactionNo: string;
  branchId: string;
  shiftCode?: string;
  status: string;
  customerName?: string | null;
  customerPhone?: string | null;
  isBuy: boolean;
  fxCurrency: string;
  fxAmount: number;
  rate: number;
  vndAmount: number;
  createdAt: string;
}

export interface FxStockDto { branchId: string; currency: string; balance: number; }

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
  create: (payload: CreateFxPayload) => runIdempotent('FX_CREATE', payload, (headers) =>
    httpClient.post<FxTransactionDto>('/fx/transactions', payload, { headers }).then((r) => r.data)),
};
