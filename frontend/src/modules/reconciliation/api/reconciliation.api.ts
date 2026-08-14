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

export interface ParsedJournalRow {
  rowNo: number;
  code: string;
  amount: number;
  currencyCode: 'USD' | 'VND';
  customerName?: string;
}

export interface ParseJournalResult {
  provider: 'WU' | 'MG';
  fileName: string;
  detectedColumns: Record<string, number>;
  rows: ParsedJournalRow[];
  errors: { rowNo: number; message: string }[];
  summary: { total: number; parsed: number; failed: number };
}

export interface FundReconItemDto {
  branchId: string;
  branchCode: string;
  currencyCode: string;
  systemBalance: number;
  physicalActual: number | null;
  variance: number;
  status: 'MATCH' | 'OVERAGE' | 'SHORTAGE' | 'NO_COUNT';
  countedAt: string | null;
}

export const reconApi = {
  runs: () => httpClient.get<ReconRunDto[]>('/reconciliation/runs').then((r) => r.data),
  fundReconciliation: (branchId?: string) =>
    httpClient.get<FundReconItemDto[]>('/reconciliation/fund', { params: branchId ? { branchId } : {} }).then((r) => r.data),
  items: (runId: string) =>
    httpClient.get<ReconItemDto[]>(`/reconciliation/runs/${runId}/items`).then((r) => r.data),
  run: (input: RunReconInput) =>
    httpClient.post<ReconRunDto>('/reconciliation/run', input).then((r) => r.data),
  parseJournal: (provider: 'WU' | 'MG', file: File) => {
    const form = new FormData();
    form.append('file', file);
    return httpClient
      .post<ParseJournalResult>('/reconciliation/parse-journal', form, {
        params: { provider },
        headers: { 'Content-Type': 'multipart/form-data' },
        timeout: 120_000, // OCR file PDF scan có thể mất vài chục giây
      })
      .then((r) => r.data);
  },
};
