export const PAID_RATE_STEP = 5;

export function getPaidRateBounds(...values: Array<number | null | undefined>) {
  const rates = values.filter((rate): rate is number => (
    typeof rate === 'number' && Number.isFinite(rate) && rate > 0
  ));
  if (rates.length === 0) return { min: 0, max: 100_000 };

  const rawMin = Math.min(...rates);
  const rawMax = Math.max(...rates);
  const min = Math.ceil(rawMin / PAID_RATE_STEP) * PAID_RATE_STEP;
  const max = Math.floor(rawMax / PAID_RATE_STEP) * PAID_RATE_STEP;
  return min <= max ? { min, max } : { min: rawMin, max: rawMax };
}

export function clampPaidRate(value: number, ...bounds: Array<number | null | undefined>) {
  const { min, max } = getPaidRateBounds(...bounds);
  if (!Number.isFinite(value) || value <= 0) return min;
  const steppedValue = Math.round(value / PAID_RATE_STEP) * PAID_RATE_STEP;
  return Math.min(Math.max(steppedValue, min), max);
}
