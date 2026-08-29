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
  scope: 'COMPANY' | 'BRANCH';
  branchId: string | null;
  branchCode: string | null;
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
  rows: Array<{ code: string; amount: number; currencyCode: string; branchId?: string; customerName?: string }>;
  createdByUserId: string;
}

export interface IReconciliationRepository {
  // Lấy GD hệ thống theo provider (WU/MG) để đối chiếu
  listSystemTxByProvider(provider: string, businessDate: Date, branchId?: string): Promise<SystemTxn[]>;
  saveRun(input: SaveRunInput): Promise<ReconRunSummary>;
  // branchId: lọc theo chi nhánh (GĐ/KTTH chọn xem riêng từng chi nhánh; STAFF bị ép theo chi nhánh của mình)
  listRuns(branchId?: string): Promise<ReconRunSummary[]>;
  findRun(runId: string): Promise<ReconRunSummary | null>;
  getItems(runId: string): Promise<ReconItem[]>;
  // F9.1 — đối chiếu quỹ hệ thống vs kiểm quỹ thực tế gần nhất
  fundReconciliation(branchId?: string): Promise<FundReconItem[]>;
  // STAFF upload journal chờ KTTH duyệt
  savePendingJournal(input: SavePendingJournalInput): Promise<PendingJournalSummary>;
  // KTTH duyệt (đã chạy đối chiếu) hoặc từ chối Journal chờ duyệt
  updatePendingJournalStatus(id: string, status: 'APPROVED' | 'REJECTED', userId: string): Promise<boolean>;
  listPendingJournals(branchId?: string): Promise<PendingJournalSummary[]>;
  getPendingJournal(id: string): Promise<{ summary: PendingJournalSummary; rows: any[] } | null>;
}

