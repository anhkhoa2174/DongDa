import { domesticTransferPosting } from './domestic-transfer.entity';

describe('domesticTransferPosting', () => {
  it('receives amount plus fee in cash and transfers amount out of bank', () => {
    expect(domesticTransferPosting('CASH_TO_BANK', 1_000_000, 10_000)).toEqual({
      cashAmount: 1_010_000,
      cashDirection: 'DEBIT',
      bankDelta: -1_000_000,
    });
  });

  it('receives amount in bank and pays amount minus fee in cash', () => {
    expect(domesticTransferPosting('BANK_TO_CASH', 1_000_000, 10_000)).toEqual({
      cashAmount: 990_000,
      cashDirection: 'CREDIT',
      bankDelta: 1_000_000,
    });
  });
});
