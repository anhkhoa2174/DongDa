import { domesticTransferBankMovementType, domesticTransferPosting } from './domestic-transfer.entity';

describe('domesticTransferPosting', () => {
  it('keeps transfer advances attached to cash-to-bank transactions', () => {
    expect(domesticTransferBankMovementType('CASH_TO_BANK')).toBe('ADVANCE_CK');
    expect(domesticTransferBankMovementType('BANK_TO_CASH')).toBe('TRANSFER_IN');
  });

  it('receives amount plus fee in cash and transfers amount out of bank', () => {
    expect(domesticTransferPosting('CASH_TO_BANK', 1_000_000, 10_000, 'CASH')).toEqual({
      cashAmount: 1_010_000,
      cashDirection: 'DEBIT',
      bankDelta: -1_000_000,
    });
  });

  it('receives amount in bank and pays amount minus fee in cash', () => {
    expect(domesticTransferPosting('BANK_TO_CASH', 1_000_000, 10_000, 'CASH')).toEqual({
      cashAmount: 990_000,
      cashDirection: 'CREDIT',
      bankDelta: 1_000_000,
    });
  });

  it('keeps the fee in the bank account when bank is selected', () => {
    expect(domesticTransferPosting('CASH_TO_BANK', 1_000_000, 10_000, 'BANK')).toEqual({
      cashAmount: 1_000_000,
      cashDirection: 'DEBIT',
      bankDelta: -990_000,
    });
    expect(domesticTransferPosting('BANK_TO_CASH', 1_000_000, 10_000, 'BANK')).toEqual({
      cashAmount: 1_000_000,
      cashDirection: 'CREDIT',
      bankDelta: 1_010_000,
    });
  });
});
