export const PAID_RATE_STEP = 5;
const RATE_BOUNDARY_TOLERANCE = 0.000001;

export function getPaidRateBounds(...values: Array<number | null | undefined>) {
  const rates = values.filter((rate): rate is number => (
    typeof rate === 'number' && Number.isFinite(rate) && rate > 0
  ));
  if (rates.length === 0) return { min: 0, max: 100_000 };

  return { min: Math.min(...rates), max: Math.max(...rates) };
}

export function clampPaidRate(value: number, ...bounds: Array<number | null | undefined>) {
  const { min, max } = getPaidRateBounds(...bounds);
  if (!Number.isFinite(value) || value <= 0) return min;
  if (Math.abs(value - min) <= RATE_BOUNDARY_TOLERANCE) return min;
  if (Math.abs(value - max) <= RATE_BOUNDARY_TOLERANCE) return max;
  const steppedValue = Math.round(value / PAID_RATE_STEP) * PAID_RATE_STEP;
  return Math.min(Math.max(steppedValue, min), max);
}
