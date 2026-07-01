export type ReconciliationSource = 'WU' | 'MG' | 'CASH' | 'BANK';
export type ReconciliationLayer = 'TRANSACTION' | 'SHIFT' | 'SYSTEM';
export type ReconciliationResult =
  | 'MATCH'
  | 'AMOUNT_MISMATCH'
  | 'CUSTOMER_MISMATCH'
  | 'MISSING_IN_SYSTEM'
  | 'MISSING_IN_JOURNAL'
  | 'POTENTIAL_DUPLICATE_CUSTOMER';

export type JournalUpload = {
  id: string;
  source: ReconciliationSource;
  fileName: string;
  uploadedAt: string;
  uploadedBy: string;
  totalRows: number;
  matched: number;
  mismatched: number;
  missingInSystem: number;
  status: 'PROCESSING' | 'DONE' | 'ERROR';
};

export type ReconciliationRow = {
  id: string;
  source: ReconciliationSource;
  externalId: string;
  externalName?: string;
  externalAmountUsd?: number;
  externalAmountVnd?: number;
  systemId?: string;
  systemName?: string;
  systemAmountUsd?: number;
  systemAmountVnd?: number;
  branchCode?: string;
  result: ReconciliationResult;
  confidence: 'HIGH' | 'MEDIUM' | 'LOW';
};
