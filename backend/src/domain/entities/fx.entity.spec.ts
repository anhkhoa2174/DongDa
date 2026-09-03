import { calculateFxVndAmount } from './fx.entity';

describe('calculateFxVndAmount', () => {
  it('uses the negotiated transaction rate for both the whole amount and the fraction', () => {
    expect(calculateFxVndAmount({
      fxAmount: 100.9,
      fractionalAmount: 0.9,
      rate: 25_500,
      fractionalRate: 25_500,
      deductionVnd: 1_000,
    })).toEqual({
      grossVndAmount: 2_572_950,
      deductionVnd: 1_000,
      vndAmount: 2_571_950,
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
