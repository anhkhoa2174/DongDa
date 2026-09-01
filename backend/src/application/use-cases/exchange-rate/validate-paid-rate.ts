import { BadRequestException } from '@nestjs/common';

const PAID_RATE_STEP = 5;

export function validatePaidAppliedRate(
  value: number,
  firstRate: number,
  secondRate: number,
  operation: 'WU' | 'MG',
  ...additionalRates: Array<number | null | undefined>
) {
  if (!Number.isFinite(value) || value <= 0) {
    throw new BadRequestException('Tỷ giá áp dụng phải là số dương hợp lệ');
  }
  if (!Number.isInteger(value) || value % PAID_RATE_STEP !== 0) {
    throw new BadRequestException(`Tỷ giá áp dụng ${operation} phải là số nguyên theo bước ${PAID_RATE_STEP} VND`);
  }
  const rates = [firstRate, secondRate, ...additionalRates]
    .filter((rate): rate is number => typeof rate === 'number' && Number.isFinite(rate) && rate > 0);
  if (rates.length === 0) return value;
  const min = Math.min(...rates);
  const max = Math.max(...rates);
  if (value < min || value > max) {
    throw new BadRequestException(`Tỷ giá áp dụng phải nằm trong biên ${min} - ${max}`);
  }
  return value;
}
