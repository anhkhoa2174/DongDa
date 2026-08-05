import { httpClient } from '@/shared/api/httpClient';

export interface ReconRunDto {
  id: string;
  runNo: string;
  provider: string;
  currencyCode: string;
  businessDate: string;
  status: string;
  systemTotal: number;
  journalTotal: number;
  varianceTotal: number;
  matchRate: number;
  matchedCount: number;
  totalCount: number;
  createdAt: string;
}

export interface ReconItemDto {
  status: string;
  code: string;
  transactionId?: string | null;
  branchId?: string | null;
  systemAmount: number;
  journalAmount: number;
  varianceAmount: number;
  note?: string;
}

export interface JournalRowInput {
  code: string;
  amount: number;
  currencyCode: 'USD' | 'VND';
  branchId?: string;
}

export interface RunReconInput {
  provider: string;
  businessDate: string;
  branchId?: string;
  rows: JournalRowInput[];
}

export const reconApi = {
  runs: () => httpClient.get<ReconRunDto[]>('/reconciliation/runs').then((r) => r.data),
  items: (runId: string) =>
    httpClient.get<ReconItemDto[]>(`/reconciliation/runs/${runId}/items`).then((r) => r.data),
  run: (input: RunReconInput) =>
    httpClient.post<ReconRunDto>('/reconciliation/run', input).then((r) => r.data),
};
