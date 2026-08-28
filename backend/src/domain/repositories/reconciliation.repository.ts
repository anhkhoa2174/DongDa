// Repository Interface: Đối chiếu (Port)
// Layer: Domain

import type { SystemTxn, ReconItem, ReconResult, FundReconItem } from '../entities/reconciliation.entity';

export interface SaveRunInput {
  provider: string; // WU | MG
  businessDate: Date;
  scope: 'COMPANY' | 'BRANCH';
  branchId?: string;
  currencyCode: 'USD' | 'VND';
  result: ReconResult;
  createdByUserId: string;
}

export interface ReconRunSummary {
  id: string;
  runNo: string;
  provider: string;
  currencyCode: string;
  businessDate: Date;
  status: string;
  systemTotal: number;
  journalTotal: number;
  varianceTotal: number;
  matchRate: number;
  matchedCount: number;
  totalCount: number;
  createdAt: Date;
  branchId?: string | null;
  branchName?: string | null;
}

// Journal do CN (STAFF) upload, chờ KTTH/GĐ duyệt rồi chạy đối chiếu
export interface PendingJournalSummary {
  id: string;
  runNo: string;
  provider: string;    // WU | MG
  businessDate: Date;
  branchId?: string | null;
  branchName?: string | null;
  parsedRowCount: number;
  uploadedByUserId: string;
  uploadedAt: Date;
  status: 'PENDING_REVIEW';
}

export interface SavePendingJournalInput {
  provider: 'WU' | 'MG';
  businessDate: Date;
  branchId?: string;
  rows: Array<{ code: string; amount: number; currencyCode: string; branchId?: string }>;
  createdByUserId: string;
}

export interface IReconciliationRepository {
  // Lấy GD hệ thống theo provider (WU/MG) để đối chiếu
  listSystemTxByProvider(provider: string, businessDate: Date, branchId?: string): Promise<SystemTxn[]>;
  saveRun(input: SaveRunInput): Promise<ReconRunSummary>;
  listRuns(): Promise<ReconRunSummary[]>;
  getItems(runId: string): Promise<ReconItem[]>;
  // F9.1 — đối chiếu quỹ hệ thống vs kiểm quỹ thực tế gần nhất
  fundReconciliation(branchId?: string): Promise<FundReconItem[]>;
  // STAFF upload journal chờ KTTH duyệt
  savePendingJournal(input: SavePendingJournalInput): Promise<PendingJournalSummary>;
  listPendingJournals(branchId?: string): Promise<PendingJournalSummary[]>;
  getPendingJournal(id: string): Promise<{ summary: PendingJournalSummary; rows: any[] } | null>;
}

