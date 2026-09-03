import { BadRequestException } from '@nestjs/common';

const PAID_RATE_STEP = 5;
const RATE_BOUNDARY_TOLERANCE = 0.000001;

export function getPaidAppliedRateBounds(...values: Array<number | null | undefined>) {
  const rates = values.filter((rate): rate is number => (
    typeof rate === 'number' && Number.isFinite(rate) && rate > 0
  ));
  if (rates.length === 0) return undefined;

  return { min: Math.min(...rates), max: Math.max(...rates) };
}

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
  const rates = [firstRate, secondRate, ...additionalRates]
    .filter((rate): rate is number => typeof rate === 'number' && Number.isFinite(rate) && rate > 0);
  if (rates.length === 0) return value;
  const bounds = getPaidAppliedRateBounds(...rates);
  if (!bounds) return value;
  const { min, max } = bounds;
  if (value < min - RATE_BOUNDARY_TOLERANCE || value > max + RATE_BOUNDARY_TOLERANCE) {
    throw new BadRequestException(`Tỷ giá áp dụng phải nằm trong biên ${min} - ${max}`);
  }
  const isBoundary = Math.abs(value - min) <= RATE_BOUNDARY_TOLERANCE
    || Math.abs(value - max) <= RATE_BOUNDARY_TOLERANCE;
  if (!isBoundary && (!Number.isInteger(value) || value % PAID_RATE_STEP !== 0)) {
    throw new BadRequestException(
      `Tỷ giá áp dụng ${operation} phải theo bước ${PAID_RATE_STEP} VND hoặc bằng chính xác một cận tỷ giá`,
    );
  }
  return value;
}
