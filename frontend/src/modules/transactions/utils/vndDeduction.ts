export const VND_CASH_ROUNDING_UNIT = 1_000;

export function suggestVndDeduction(grossVnd: number) {
  const roundedGross = Math.max(Math.round(Number(grossVnd) || 0), 0);
  if (roundedGross < VND_CASH_ROUNDING_UNIT) return 0;
  return roundedGross % VND_CASH_ROUNDING_UNIT;
}

export function clampVndDeduction(value: number, grossVnd: number) {
  const roundedGross = Math.max(Math.round(Number(grossVnd) || 0), 0);
  const roundedValue = Math.max(Math.round(Number(value) || 0), 0);
  return Math.min(roundedValue, roundedGross);
}
