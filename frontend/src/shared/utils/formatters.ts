export function formatCurrency(value: number, currency = 'VND') {
  return new Intl.NumberFormat('vi-VN', {
    style: 'currency',
    currency,
    maximumFractionDigits: currency === 'VND' ? 0 : 2,
  }).format(value);
}

export function formatNumber(value: number, maximumFractionDigits = 0) {
  return new Intl.NumberFormat('vi-VN', { maximumFractionDigits }).format(value);
}

/** Format USD amount without currency symbol confusion — always "$ 1,234" */
export function formatUsd(value: number, maximumFractionDigits = 2) {
  return `$ ${new Intl.NumberFormat('en-US', { maximumFractionDigits }).format(value)}`;
}

/** Format any foreign-currency amount: EUR 1,234 · JPY 85,000 · CNY 3,520 */
export function formatForeignCurrency(value: number, code: string) {
  return `${code} ${new Intl.NumberFormat('en-US', { maximumFractionDigits: 2 }).format(value)}`;
}

/** Format an ISO timestamp to Vietnamese locale — 14:32 · 29/06/2026 */
export function formatDateTime(iso?: string) {
  if (!iso) return '—';
  const d = new Date(iso);
  return d.toLocaleString('vi-VN', {
    hour: '2-digit',
    minute: '2-digit',
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
  });
}

/** Format an ISO date to Vietnamese short date — 29/06/2026 */
export function formatDate(iso?: string) {
  if (!iso) return '—';
  const d = new Date(iso);
  return d.toLocaleDateString('vi-VN');
}

/** Format a value with signed prefix — "+180,000 ₫" or "-25,000 ₫" */
export function formatSignedCurrency(value: number, currency = 'VND') {
  if (value === 0) return formatCurrency(0, currency);
  const sign = value > 0 ? '+' : '';
  return sign + formatCurrency(value, currency);
}
