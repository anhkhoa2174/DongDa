import { BadRequestException } from '@nestjs/common';
import { assertMgPayoutMatches, calculateMgPayout, validateMgAppliedRate } from './mg.use-cases';

describe('MG financial rules', () => {
  it('calculates payout exclusively from paid amount and active rate', () => {
    expect(calculateMgPayout('USD', 'VND', 100, 0, 26_000)).toBe(2_600_000);
    expect(calculateMgPayout('VND', 'USD', 0, 2_600_000, 26_000)).toBe(100);
  });

  it('rejects a payout split that exceeds the computed amount', () => {
    expect(() => assertMgPayoutMatches('VND', 2_600_000, 0, 2_700_000, 26_000))
      .toThrow(BadRequestException);
  });

  it('allows an adjustable integer USD payout and converts the remaining USD to VND', () => {
    expect(() => assertMgPayoutMatches('USD', 1_500.5, 1_500, 13_000, 26_000)).not.toThrow();
    expect(() => assertMgPayoutMatches('USD', 1_500.5, 1_499, 39_000, 26_000)).not.toThrow();
    expect(() => assertMgPayoutMatches('USD', 1_500.5, 1_501, 0, 26_000)).toThrow(BadRequestException);
    expect(() => assertMgPayoutMatches('USD', 1_500.5, 1_499, 38_000, 26_000)).toThrow(BadRequestException);
  });

  it('rounds VND payouts to whole dong and USD payouts to cents', () => {
    expect(calculateMgPayout('USD', 'VND', 1.23, 0, 25_501)).toBe(31_366);
    expect(calculateMgPayout('VND', 'USD', 0, 31_366, 25_501)).toBe(1.23);
  });

  it('accepts step-5 rates and exact boundaries inside the Paid and USD FX range', () => {
    expect(validateMgAppliedRate(25_975, 25_500, 26_000)).toBe(25_975);
    expect(validateMgAppliedRate(26_001.25, 25_500, 26_001.25)).toBe(26_001.25);
    expect(() => validateMgAppliedRate(25_973, 25_500, 26_000)).toThrow(BadRequestException);
    expect(() => validateMgAppliedRate(26_005, 25_500, 26_000)).toThrow(BadRequestException);
  });

  it('accepts an applied rate different from the system rate when it is within bounds', () => {
    expect(validateMgAppliedRate(25_590, 25_590, 25_900)).toBe(25_590);
  });

  it('uses the adjusted rate for a VND payout and the fractional USD payout', () => {
    expect(calculateMgPayout('USD', 'VND', 100.5, 0, 25_975)).toBe(2_610_488);
    expect(() => assertMgPayoutMatches('USD', 100.5, 100, 12_988, 25_975)).not.toThrow();
  });
});
