import { calculateCentralFundConversionValue } from './fund.entity';

describe('calculateCentralFundConversionValue', () => {
  it('calculates net VND from an operator-entered rate and deduction', () => {
    expect(calculateCentralFundConversionValue(100.5, 30_125.75, 50_000)).toEqual({
      grossVndAmount: 3_027_638,
      deduction: 50_000,
      vndAmount: 2_977_638,
    });
  });

  it('rounds the gross value and deduction to whole VND', () => {
    expect(calculateCentralFundConversionValue(1.25, 16.75, 0.4)).toEqual({
      grossVndAmount: 21,
      deduction: 0,
      vndAmount: 21,
    });
  });
});
