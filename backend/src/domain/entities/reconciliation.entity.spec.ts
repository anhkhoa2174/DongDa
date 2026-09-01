import {
  normalizeReconciliationCode, reconcile, ReconItemStatus,
} from './reconciliation.entity';

describe('reconcile', () => {
  it('matches only the requested business-day system set and currency key', () => {
    const result = reconcile([
      { code: 'A', transactionId: 'tx-1', branchId: 'b-1', amount: 100, currencyCode: 'USD' },
    ], [
      { code: 'A', amount: 2_600_000, currencyCode: 'VND', branchId: 'b-1' },
    ]);
    expect(result.items.map((item) => item.status)).toEqual([
      ReconItemStatus.MISSING_IN_SYSTEM,
      ReconItemStatus.MISSING_IN_JOURNAL,
    ]);
  });

  it('does not reuse one system transaction for duplicate journal rows', () => {
    const result = reconcile([
      { code: '1234567890', transactionId: 'tx-1', branchId: 'b-1', amount: 100, currencyCode: 'USD' },
    ], [
      { code: '1234567890', amount: 100, currencyCode: 'USD', branchId: 'b-1' },
      { code: '1234567890', amount: 100, currencyCode: 'USD', branchId: 'b-1' },
    ]);

    expect(result.matchRate).toBe(0.5);
    expect(result.varianceTotal).toBe(-100);
    expect(result.items.map((item) => item.status)).toEqual([
      ReconItemStatus.MATCHED,
      ReconItemStatus.MISSING_IN_SYSTEM,
    ]);
  });

  it('never matches a journal row to a transaction from another branch', () => {
    const result = reconcile([
      { code: '1234567890', transactionId: 'tx-1', branchId: 'b-1', amount: 100, currencyCode: 'USD' },
    ], [
      { code: '1234567890', amount: 100, currencyCode: 'USD', branchId: 'b-2' },
    ]);

    expect(result.matchRate).toBe(0);
    expect(result.items.map((item) => item.status)).toEqual([
      ReconItemStatus.MISSING_IN_SYSTEM,
      ReconItemStatus.MISSING_IN_JOURNAL,
    ]);
  });

  it('normalizes formatted WU/MG references before matching', () => {
    expect(normalizeReconciliationCode('633-775-1692')).toBe('6337751692');
    expect(normalizeReconciliationCode('ab-12 cd34')).toBe('AB12CD34');
  });
});
