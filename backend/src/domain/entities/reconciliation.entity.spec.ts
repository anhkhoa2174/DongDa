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
      ReconItemStatus.DUPLICATE_IN_JOURNAL,
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

  it('matches across branches for company-level Final reconciliation', () => {
    const result = reconcile([
      { code: '7996434323', transactionId: 'tx-lhp', branchId: 'LHP', amount: 700, currencyCode: 'USD' },
    ], [
      { code: '7996434323', amount: 700, currencyCode: 'USD', branchId: 'NCT' },
    ], { matchByBranch: false });

    expect(result.matchRate).toBe(1);
    expect(result.items).toEqual([
      expect.objectContaining({
        status: ReconItemStatus.MATCHED,
        transactionId: 'tx-lhp',
        branchId: 'LHP',
      }),
    ]);
  });

  it('matches many company transactions to Journal rows from different branches without crossing codes', () => {
    const result = reconcile([
      { code: '1111111111', transactionId: 'tx-a', branchId: 'A', amount: 100, currencyCode: 'USD' },
      { code: '2222222222', transactionId: 'tx-b', branchId: 'B', amount: 200, currencyCode: 'USD' },
      { code: '3333333333', transactionId: 'tx-c', branchId: 'C', amount: 300, currencyCode: 'USD' },
    ], [
      { code: '333-333-3333', amount: 300, currencyCode: 'USD', branchId: 'A' },
      { code: '1111111111', amount: 100, currencyCode: 'USD', branchId: 'B' },
      { code: '2222222222', amount: 200, currencyCode: 'USD', branchId: 'C' },
    ], { matchByBranch: false });

    expect(result.matchedCount).toBe(3);
    expect(result.matchRate).toBe(1);
    expect(result.items.map((item) => [item.code, item.transactionId, item.branchId])).toEqual([
      ['3333333333', 'tx-c', 'C'],
      ['1111111111', 'tx-a', 'A'],
      ['2222222222', 'tx-b', 'B'],
    ]);
  });

  it('does not post a duplicated company Journal row twice', () => {
    const result = reconcile([
      { code: '1234567890', transactionId: 'tx-a', branchId: 'A', amount: 100, currencyCode: 'USD' },
    ], [
      { code: '1234567890', amount: 100, currencyCode: 'USD', branchId: 'A' },
      { code: '1234567890', amount: 100, currencyCode: 'USD', branchId: 'B' },
    ], { matchByBranch: false });

    expect(result.matchedCount).toBe(1);
    expect(result.items.map((item) => item.status)).toEqual([
      ReconItemStatus.MATCHED,
      ReconItemStatus.DUPLICATE_IN_JOURNAL,
    ]);
    expect(result.items.filter((item) => item.transactionId === 'tx-a')).toHaveLength(1);
    expect(result.items[1]).toEqual(expect.objectContaining({
      note: 'MTCN/Reference và loại tiền bị lặp trong Journal',
    }));
    expect(result.items[1]).not.toHaveProperty('transactionId');
  });

  it('keeps amount and currency mismatches separate during company Final', () => {
    const result = reconcile([
      { code: '1234567890', transactionId: 'tx-usd', branchId: 'A', amount: 100, currencyCode: 'USD' },
      { code: '0987654321', transactionId: 'tx-vnd', branchId: 'B', amount: 2_500_000, currencyCode: 'VND' },
    ], [
      { code: '1234567890', amount: 99, currencyCode: 'USD', branchId: 'B' },
      { code: '0987654321', amount: 2_500_000, currencyCode: 'USD', branchId: 'A' },
    ], { matchByBranch: false });

    expect(result.items.map((item) => item.status)).toEqual([
      ReconItemStatus.AMOUNT_VARIANCE,
      ReconItemStatus.MISSING_IN_SYSTEM,
      ReconItemStatus.MISSING_IN_JOURNAL,
    ]);
    expect(result.items[0]).toEqual(expect.objectContaining({ transactionId: 'tx-usd', varianceAmount: 1 }));
    expect(result.items[2]).toEqual(expect.objectContaining({ transactionId: 'tx-vnd', currencyCode: 'VND' }));
  });

  it('normalizes formatted WU/MG references before matching', () => {
    expect(normalizeReconciliationCode('633-775-1692')).toBe('6337751692');
    expect(normalizeReconciliationCode('ab-12 cd34')).toBe('AB12CD34');
  });
});
