import { calculateFxVndAmount } from './fx.entity';

describe('calculateFxVndAmount', () => {
  it('uses the negotiated rate for the whole amount and the system buy rate for the fraction', () => {
    expect(calculateFxVndAmount({
      fxAmount: 100.9,
      fractionalAmount: 0.9,
      rate: 25_500,
      fractionalRate: 26_000,
      deductionVnd: 1_000,
    })).toEqual({
      grossVndAmount: 2_573_400,
      deductionVnd: 1_000,
      vndAmount: 2_572_400,
    });
  });

  it('keeps the existing calculation when there is no fraction or deduction', () => {
    expect(calculateFxVndAmount({ fxAmount: 100, rate: 25_500 })).toEqual({
      grossVndAmount: 2_550_000,
      deductionVnd: 0,
      vndAmount: 2_550_000,
    });
  });
});
