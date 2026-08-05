// Repository Interface: Đối chiếu (Port)
// Layer: Domain

import type { SystemTxn, ReconItem, ReconResult } from '../entities/reconciliation.entity';

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
}

export interface IReconciliationRepository {
  // Lấy GD hệ thống theo provider (WU/MG) để đối chiếu
  listSystemTxByProvider(provider: string, businessDate: Date, branchId?: string): Promise<SystemTxn[]>;
  saveRun(input: SaveRunInput): Promise<ReconRunSummary>;
  listRuns(): Promise<ReconRunSummary[]>;
  getItems(runId: string): Promise<ReconItem[]>;
}
