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
}
