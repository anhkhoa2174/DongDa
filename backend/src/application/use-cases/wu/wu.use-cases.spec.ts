import { BadRequestException, ConflictException } from '@nestjs/common';
import { CreateWuUseCase, assertWuPayoutMatches, validateAppliedRate } from './wu.use-cases';

const base = {
  branchId: '00000000-0000-0000-0000-000000000001', mtcn: '1234567890',
  wuUsdAmount: 100.25, wuVndAmount: 2_600_000, receivedUsd: 0, receivedVnd: 2_600_000,
  appliedRate: 26_000, payoutCurrency: 'VND', paidCurrency: 'USD',
};

describe('WU financial rules', () => {
  it('requires direct WU VND payout to equal WU VND amount', () => {
    expect(() => assertWuPayoutMatches({ ...base, receivedVnd: 2_500_000 }, 26_000))
      .toThrow(BadRequestException);
  });

  it('splits USD integer and fractional payout', () => {
    expect(() => assertWuPayoutMatches({
      ...base, payoutCurrency: 'USD', receivedUsd: 100, receivedVnd: 6_500,
    }, 26_000)).not.toThrow();
  });

  it('rejects an applied rate outside the allowed band', () => {
    expect(() => validateAppliedRate(27_000, 25_500, 26_000)).toThrow(BadRequestException);
  });

  it('requires the WU transaction rate to use a 50 VND step', () => {
    expect(() => validateAppliedRate(25_975, 25_500, 26_000)).toThrow(BadRequestException);
  });

  it('rejects an MTCN that was already processed before touching rates or funds', async () => {
    const wuRepo = { mtcnExists: jest.fn().mockResolvedValue(true) };
    const rateRepo = { findActive: jest.fn() };
    const useCase = new CreateWuUseCase(wuRepo as any, rateRepo as any);

    await expect(useCase.execute(base, 'user-1')).rejects.toBeInstanceOf(ConflictException);
    expect(rateRepo.findActive).not.toHaveBeenCalled();
  });
});
