import { BadRequestException } from '@nestjs/common';
import { validateCashDenominations } from './prisma-shift.repository';

describe('validateCashDenominations', () => {
  it('calculates a valid VND denomination breakdown', () => {
    expect(validateCashDenominations('VND', 1_200_000, [
      { denomination: 500_000, quantity: 2 },
      { denomination: 200_000, quantity: 1 },
    ])).toEqual([
      { denomination: 500_000, quantity: 2, amount: 1_000_000 },
      { denomination: 200_000, quantity: 1, amount: 200_000 },
    ]);
  });

  it('rejects a total that differs from actualAmount', () => {
    expect(() => validateCashDenominations('USD', 101, [
      { denomination: 100, quantity: 1 },
    ])).toThrow(BadRequestException);
  });

  it('rejects unsupported cash denominations', () => {
    expect(() => validateCashDenominations('USD', 3, [
      { denomination: 3, quantity: 1 },
    ])).toThrow('Mệnh giá 3 USD không hợp lệ');
  });

  it('keeps foreign currencies as aggregate quantities', () => {
    expect(validateCashDenominations('EUR', 12.5)).toEqual([]);
    expect(() => validateCashDenominations('EUR', 10, [
      { denomination: 10, quantity: 1 },
    ])).toThrow('EUR chỉ kiểm theo tổng số lượng');
  });
});
