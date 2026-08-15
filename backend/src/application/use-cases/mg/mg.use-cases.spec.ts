import { BadRequestException } from '@nestjs/common';
import { assertMgPayoutMatches, calculateMgPayout } from './mg.use-cases';

describe('MG financial rules', () => {
  it('calculates payout exclusively from paid amount and active rate', () => {
    expect(calculateMgPayout('USD', 'VND', 100, 0, 26_000)).toBe(2_600_000);
    expect(calculateMgPayout('VND', 'USD', 0, 2_600_000, 26_000)).toBe(100);
  });

  it('rejects a payout split that exceeds the computed amount', () => {
    expect(() => assertMgPayoutMatches('VND', 2_600_000, 0, 2_700_000, 26_000))
      .toThrow(BadRequestException);
  });

  it('requires USD cash to equal the integer payout and converts only the fractional part', () => {
    expect(() => assertMgPayoutMatches('USD', 1_500.5, 1_500, 13_000, 26_000)).not.toThrow();
    expect(() => assertMgPayoutMatches('USD', 1_500.5, 1_499, 39_000, 26_000))
      .toThrow(BadRequestException);
  });

  it('rounds VND payouts to whole dong and USD payouts to cents', () => {
    expect(calculateMgPayout('USD', 'VND', 1.23, 0, 25_501)).toBe(31_366);
    expect(calculateMgPayout('VND', 'USD', 0, 31_366, 25_501)).toBe(1.23);
  });
});
