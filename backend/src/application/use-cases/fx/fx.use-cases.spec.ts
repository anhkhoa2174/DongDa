import { BadRequestException } from '@nestjs/common';
import { CreateFxUseCase, validateFxAppliedRate } from './fx.use-cases';

describe('FX applied-rate margin', () => {
  it('allows a buy rate from system rate minus margin through system rate', () => {
    expect(validateFxAppliedRate(26_000, 26_000, 500, true)).toBe(26_000);
    expect(validateFxAppliedRate(25_500, 26_000, 500, true)).toBe(25_500);
    expect(() => validateFxAppliedRate(25_499, 26_000, 500, true)).toThrow(BadRequestException);
    expect(() => validateFxAppliedRate(26_001, 26_000, 500, true)).toThrow(BadRequestException);
  });

  it('allows a sell rate from system rate through system rate plus margin', () => {
    expect(validateFxAppliedRate(26_500, 26_000, 500, false)).toBe(26_500);
    expect(() => validateFxAppliedRate(26_501, 26_000, 500, false)).toThrow(BadRequestException);
    expect(() => validateFxAppliedRate(25_999, 26_000, 500, false)).toThrow(BadRequestException);
  });

  it('locks the applied rate when margin is zero', () => {
    expect(validateFxAppliedRate(26_000, 26_000, 0, true)).toBe(26_000);
    expect(() => validateFxAppliedRate(25_999, 26_000, 0, true)).toThrow(BadRequestException);
  });
});

describe('CreateFxUseCase purchase adjustments', () => {
  const activeRate = { rate: 26_000, margin: 500 };

  it('adds the fraction to stock and keeps its rate fixed at the system buy rate', async () => {
    const fxRepo = { create: jest.fn(async (input) => input) };
    const rateRepo = { findActive: jest.fn(async () => [activeRate]) };
    const useCase = new CreateFxUseCase(fxRepo as any, rateRepo as any);

    await useCase.execute({
      branchId: 'branch-id',
      isBuy: true,
      fxCurrency: 'USD',
      fxAmount: 100,
      fractionalAmount: 0.9,
      deductionVnd: 1_000,
      rate: 25_500,
    }, 'user-id', 'request-id');

    expect(fxRepo.create).toHaveBeenCalledWith(expect.objectContaining({
      fxAmount: 100.9,
      fractionalAmount: 0.9,
      fractionalRate: 26_000,
      deductionVnd: 1_000,
      rate: 25_500,
    }));
  });

  it('rejects fraction and deduction on a sell transaction', async () => {
    const fxRepo = { create: jest.fn() };
    const rateRepo = { findActive: jest.fn(async () => [activeRate]) };
    const useCase = new CreateFxUseCase(fxRepo as any, rateRepo as any);

    await expect(useCase.execute({
      branchId: 'branch-id',
      isBuy: false,
      fxCurrency: 'USD',
      fxAmount: 100,
      fractionalAmount: 0.9,
      deductionVnd: 0,
      rate: 26_000,
    }, 'user-id', 'request-id')).rejects.toThrow('chỉ áp dụng khi mua ngoại tệ');
    expect(fxRepo.create).not.toHaveBeenCalled();
  });

  it('allows a purchase that contains only a fractional amount', async () => {
    const fxRepo = { create: jest.fn(async (input) => input) };
    const rateRepo = { findActive: jest.fn(async () => [activeRate]) };
    const useCase = new CreateFxUseCase(fxRepo as any, rateRepo as any);

    await useCase.execute({
      branchId: 'branch-id',
      isBuy: true,
      fxCurrency: 'USD',
      fxAmount: 0,
      fractionalAmount: 0.9,
      deductionVnd: 0,
      rate: 25_500,
    }, 'user-id', 'request-id');

    expect(fxRepo.create).toHaveBeenCalledWith(expect.objectContaining({
      fxAmount: 0.9,
      fractionalAmount: 0.9,
      fractionalRate: 26_000,
    }));
  });
});
