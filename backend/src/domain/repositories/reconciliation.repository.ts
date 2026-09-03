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
  stage?: 'BRANCH' | 'FINAL';
  postFinancial?: boolean;
  submitForFinal?: boolean;
  sourceRunIds?: string[];
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
  stage: 'BRANCH' | 'FINAL';
  systemTotal: number;
  journalTotal: number;
  varianceTotal: number;
  matchRate: number;
  matchedCount: number;
  totalCount: number;
  createdAt: Date;
  submittedAt?: Date | null;
  branchName?: string | null;
}

export interface BranchRunForFinal {
  summary: ReconRunSummary;
  rows: Array<{ code: string; amount: number; currencyCode: 'USD' | 'VND'; branchId: string; customerName?: string | null }>;
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
  listRuns(branchId?: string, provider?: 'WU' | 'MG'): Promise<ReconRunSummary[]>;
  findRun(runId: string): Promise<ReconRunSummary | null>;
  getItems(runId: string): Promise<ReconItem[]>;
  submitBranchRun(provider: 'WU' | 'MG', runId: string, submittedByUserId: string): Promise<ReconRunSummary>;
  listSubmittedBranchRuns(provider: 'WU' | 'MG', branchId?: string): Promise<ReconRunSummary[]>;
  getBranchRunsForFinal(provider: 'WU' | 'MG', runIds: string[]): Promise<BranchRunForFinal[]>;
  // F9.1 — đối chiếu quỹ hệ thống vs kiểm quỹ thực tế gần nhất
  fundReconciliation(branchId?: string): Promise<FundReconItem[]>;
  // STAFF upload journal chờ KTTH duyệt
  savePendingJournal(input: SavePendingJournalInput): Promise<PendingJournalSummary>;
  // KTTH duyệt (đã chạy đối chiếu) hoặc từ chối Journal chờ duyệt
  updatePendingJournalStatus(id: string, status: 'APPROVED' | 'REJECTED', userId: string): Promise<boolean>;
  listPendingJournals(branchId?: string, provider?: 'WU' | 'MG'): Promise<PendingJournalSummary[]>;
  getPendingJournal(id: string): Promise<{ summary: PendingJournalSummary; rows: any[] } | null>;
}
