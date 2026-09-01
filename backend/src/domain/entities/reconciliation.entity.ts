// Domain Entity: Đối chiếu Journal (WU/MG)
// Layer: Domain
//
// So khớp GD hệ thống với dòng Journal cuối ngày theo MSKH/Reference.
// Khóa: code (MSKH cho WU, Reference Number cho MG).

export enum ReconItemStatus {
  MATCHED = 'MATCHED',
  MISSING_IN_SYSTEM = 'MISSING_IN_SYSTEM', // Journal có, hệ thống không
  MISSING_IN_JOURNAL = 'MISSING_IN_JOURNAL', // hệ thống có, Journal không
  AMOUNT_VARIANCE = 'AMOUNT_VARIANCE', // khớp mã, lệch số tiền
}

// F9.1 — Đối chiếu quỹ: tồn hệ thống (ledger) vs tồn thực tế (kiểm quỹ gần nhất)
export type FundReconStatus = 'MATCH' | 'OVERAGE' | 'SHORTAGE' | 'NO_COUNT';

export interface FundReconItem {
  branchId: string;
  branchCode: string;
  currencyCode: string;
  systemBalance: number; // tồn hệ thống hiện tại (từ ledger)
  physicalActual: number | null; // tồn thực tế lần kiểm quỹ gần nhất (null nếu chưa kiểm)
  variance: number; // physicalActual - systemBalance (0 nếu chưa kiểm)
  status: FundReconStatus;
  countedAt: Date | null;
}

export interface SystemTxn {
  code: string; // MSKH / Reference
  transactionId: string;
  branchId: string;
  amount: number; // USD
  currencyCode: 'USD' | 'VND';
  customerName?: string | null;
}

export interface JournalRow {
  code: string;
  amount: number; // USD
  currencyCode?: 'USD' | 'VND';
  branchId?: string;
  customerName?: string;
}

export interface ReconItem {
  status: ReconItemStatus;
  code: string;
  transactionId?: string | null;
  branchId?: string | null;
  systemAmount: number;
  journalAmount: number;
  varianceAmount: number;
  currencyCode: 'USD' | 'VND';
  customerName?: string | null; // tên khách theo Journal (ưu tiên) hoặc theo hệ thống
  note?: string;
}

export interface ReconResult {
  items: ReconItem[];
  systemTotal: number;
  journalTotal: number;
  varianceTotal: number;
  matchedCount: number;
  totalCount: number;
  matchRate: number; // 0..1
}

const EPS = 0.01;

export function normalizeReconciliationCode(code: string): string {
  return String(code ?? '').trim().toUpperCase().replace(/[^A-Z0-9]/g, '');
}

export function isValidReconciliationCode(code: string, provider: 'WU' | 'MG'): boolean {
  const normalized = normalizeReconciliationCode(code);
  return provider === 'WU' ? /^\d{10}$/.test(normalized) : /^[A-Z0-9]{8}$/.test(normalized);
}

// Thuật toán đối chiếu thuần (không phụ thuộc DB)
export function reconcile(system: SystemTxn[], journal: JournalRow[]): ReconResult {
  const items: ReconItem[] = [];
  const key = (code: string, currency: string, branchId?: string | null) =>
    `${branchId ?? ''}::${normalizeReconciliationCode(code)}::${currency}`;
  const sysByCode = new Map<string, SystemTxn[]>();
  for (const txn of system) {
    const matchKey = key(txn.code, txn.currencyCode, txn.branchId);
    const candidates = sysByCode.get(matchKey) ?? [];
    candidates.push(txn);
    sysByCode.set(matchKey, candidates);
  }
  const matchedTransactionIds = new Set<string>();

  for (const jr of journal) {
    const currencyCode = jr.currencyCode ?? 'USD';
    const code = normalizeReconciliationCode(jr.code);
    const matchKey = key(code, currencyCode, jr.branchId);
    const sys = sysByCode.get(matchKey)?.shift();
    if (!sys) {
      items.push({
        status: ReconItemStatus.MISSING_IN_SYSTEM, code,
        branchId: jr.branchId ?? null, currencyCode, customerName: jr.customerName ?? null,
        systemAmount: 0, journalAmount: jr.amount, varianceAmount: jr.amount,
        note: 'Journal có nhưng hệ thống chưa ghi nhận',
      });
      continue;
    }
    matchedTransactionIds.add(sys.transactionId);
    const variance = sys.amount - jr.amount;
    if (Math.abs(variance) < EPS) {
      items.push({
        status: ReconItemStatus.MATCHED, code, transactionId: sys.transactionId,
        branchId: sys.branchId, currencyCode, systemAmount: sys.amount, journalAmount: jr.amount, varianceAmount: 0,
        customerName: jr.customerName ?? sys.customerName ?? null,
      });
    } else {
      items.push({
        status: ReconItemStatus.AMOUNT_VARIANCE, code, transactionId: sys.transactionId,
        branchId: sys.branchId, currencyCode, systemAmount: sys.amount, journalAmount: jr.amount, varianceAmount: variance,
        customerName: jr.customerName ?? sys.customerName ?? null,
        note: `Lệch ${variance} ${currencyCode}`,
      });
    }
  }

  for (const sys of system) {
    if (!matchedTransactionIds.has(sys.transactionId)) {
      items.push({
        status: ReconItemStatus.MISSING_IN_JOURNAL, code: normalizeReconciliationCode(sys.code), transactionId: sys.transactionId,
        branchId: sys.branchId, currencyCode: sys.currencyCode, systemAmount: sys.amount, journalAmount: 0, varianceAmount: sys.amount,
        customerName: sys.customerName ?? null,
        note: 'Hệ thống có nhưng Journal thiếu',
      });
    }
  }

  const systemTotal = system.reduce((s, x) => s + x.amount, 0);
  const journalTotal = journal.reduce((s, x) => s + x.amount, 0);
  const matchedCount = items.filter((i) => i.status === ReconItemStatus.MATCHED).length;
  const totalCount = items.length;
  return {
    items,
    systemTotal,
    journalTotal,
    varianceTotal: systemTotal - journalTotal,
    matchedCount,
    totalCount,
    matchRate: totalCount > 0 ? matchedCount / totalCount : 1,
  };
}
