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

// Thuật toán đối chiếu thuần (không phụ thuộc DB)
export function reconcile(system: SystemTxn[], journal: JournalRow[]): ReconResult {
  const items: ReconItem[] = [];
  const key = (code: string, currency: string) => `${code}::${currency}`;
  const sysByCode = new Map(system.map((s) => [key(s.code, s.currencyCode), s]));
  const matchedCodes = new Set<string>();

  for (const jr of journal) {
    const currencyCode = jr.currencyCode ?? 'USD';
    const matchKey = key(jr.code, currencyCode);
    const sys = sysByCode.get(matchKey);
    if (!sys) {
      items.push({
        status: ReconItemStatus.MISSING_IN_SYSTEM, code: jr.code,
        branchId: jr.branchId ?? null, currencyCode,
        systemAmount: 0, journalAmount: jr.amount, varianceAmount: jr.amount,
        note: 'Journal có nhưng hệ thống chưa ghi nhận',
      });
      continue;
    }
    matchedCodes.add(matchKey);
    const variance = sys.amount - jr.amount;
    if (Math.abs(variance) < EPS) {
      items.push({
        status: ReconItemStatus.MATCHED, code: jr.code, transactionId: sys.transactionId,
        branchId: sys.branchId, currencyCode, systemAmount: sys.amount, journalAmount: jr.amount, varianceAmount: 0,
      });
    } else {
      items.push({
        status: ReconItemStatus.AMOUNT_VARIANCE, code: jr.code, transactionId: sys.transactionId,
        branchId: sys.branchId, currencyCode, systemAmount: sys.amount, journalAmount: jr.amount, varianceAmount: variance,
        note: `Lệch ${variance} USD`,
      });
    }
  }

  for (const sys of system) {
    if (!matchedCodes.has(key(sys.code, sys.currencyCode))) {
      items.push({
        status: ReconItemStatus.MISSING_IN_JOURNAL, code: sys.code, transactionId: sys.transactionId,
        branchId: sys.branchId, currencyCode: sys.currencyCode, systemAmount: sys.amount, journalAmount: 0, varianceAmount: sys.amount,
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
