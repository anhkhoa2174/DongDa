import { BadRequestException } from '@nestjs/common';
import { validateFxAppliedRate } from './fx.use-cases';

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
