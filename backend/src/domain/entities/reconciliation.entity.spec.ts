import { reconcile, ReconItemStatus } from './reconciliation.entity';

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
});
