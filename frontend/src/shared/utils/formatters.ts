// shared/utils/formatters/currency.ts

type NullableNumber = number | null | undefined;
type NullableDate = Date | string | number | null | undefined;
type InputValue = string | number | null | undefined;

const FALLBACK = '—';

function isValidNumber(value: NullableNumber): value is number {
  return typeof value === 'number' && Number.isFinite(value);
}

function parseDate(value: NullableDate) {
  if (value === null || value === undefined || value === '') return null;

  const date = value instanceof Date ? value : new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

function formatInputNumber(
  value: InputValue,
  groupSeparator = ',',
  decimalSeparator = '.',
) {
  if (value === null || value === undefined || value === '') return '';

  const escapedGroupSeparator = groupSeparator.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const stringValue = String(value);
  const rawValue = typeof value === 'number'
    ? stringValue
    : stringValue
        .replace(new RegExp(escapedGroupSeparator, 'g'), '')
        .replace(decimalSeparator, '.')
        .replace(/[^\d.-]/g, '');
  if (!rawValue) return '';

  const isNegative = rawValue.startsWith('-');
  const unsignedValue = isNegative ? rawValue.slice(1) : rawValue;
  const [integerPart = '', ...decimalParts] = unsignedValue.split('.');
  const formattedInteger = integerPart.replace(/\B(?=(\d{3})+(?!\d))/g, groupSeparator);
  const decimalPart = decimalParts.join('');

  return `${isNegative ? '-' : ''}${formattedInteger}${decimalParts.length > 0 ? `${decimalSeparator}${decimalPart}` : ''}`;
}

function parseInputNumber(
  value: string | undefined,
  groupSeparator = ',',
  decimalSeparator = '.',
) {
  if (!value) return 0;

  const escapedGroupSeparator = groupSeparator.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  let normalizedValue = value
    .replace(new RegExp(escapedGroupSeparator, 'g'), '')
    .replace(decimalSeparator, '.')
    .replace(/[^\d.-]/g, '');

  const isNegative = normalizedValue.startsWith('-');
  normalizedValue = normalizedValue.replace(/-/g, '');
  const [integerPart = '', ...decimalParts] = normalizedValue.split('.');
  const decimalPart = decimalParts.join('');

  const parsedValue = `${isNegative ? '-' : ''}${integerPart}${decimalParts.length > 0 ? `.${decimalPart}` : ''}`;

  return Number(parsedValue || 0);
}

export const numberInputFormatter = (value: InputValue) => formatInputNumber(value);
export const numberInputParser = (value: string | undefined) => parseInputNumber(value);
export const usdInputFormatter = numberInputFormatter;
export const usdInputParser = numberInputParser;
export const exchangeRateInputFormatter = numberInputFormatter;
export const exchangeRateInputParser = numberInputParser;

export function normalizeDigits(value: string | number | null | undefined, maxLength?: number) {
  const digits = String(value ?? '').replace(/\D/g, '');
  return typeof maxLength === 'number' ? digits.slice(0, maxLength) : digits;
}

export function formatWuMtcn(value: string | number | null | undefined) {
  const digits = normalizeDigits(value, 10);
  const parts = [digits.slice(0, 3), digits.slice(3, 6), digits.slice(6, 10)].filter(Boolean);
  return parts.join('-');
}

/**
 * Format tiền Việt
 * Example: 1250000 -> 1,250,000 ₫
 */
export function formatVnd(value: NullableNumber) {
  if (!isValidNumber(value)) return FALLBACK;

  return `${new Intl.NumberFormat('en-US', {
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(value)} ₫`;
}

/**
 * Format ngoại tệ theo mã tiền tệ
 * Example:
 * USD 1234.5 -> USD 1,234.50
 * EUR 1234.5 -> EUR 1,234.50
 * JPY 85000 -> JPY 85,000
 */
export function formatForeignCurrency(
  value: NullableNumber,
  currencyCode: string,
  maximumFractionDigits = 2,
) {
  if (!isValidNumber(value)) return FALLBACK;

  return `${currencyCode.toUpperCase()} ${new Intl.NumberFormat('en-US', {
    minimumFractionDigits: 0,
    maximumFractionDigits,
  }).format(value)}`;
}

/**
 * Format USD riêng để tránh nhầm với VND
 * Example: 1234.5 -> $ 1,234.50
 */
export function formatUsd(value: NullableNumber, maximumFractionDigits = 2) {
  if (!isValidNumber(value)) return FALLBACK;

  return `$ ${new Intl.NumberFormat('en-US', {
    minimumFractionDigits: 0,
    maximumFractionDigits,
  }).format(value)}`;
}

/**
 * Format tỷ giá
 * Example:
 * 26235 -> 26,235
 * 26235.5 -> 26,235.5
 */
export function formatExchangeRate(
  value: NullableNumber,
  maximumFractionDigits = 2,
) {
  if (!isValidNumber(value)) return FALLBACK;

  return new Intl.NumberFormat('en-US', {
    minimumFractionDigits: 0,
    maximumFractionDigits,
  }).format(value);
}

/**
 * Format tỷ giá có đơn vị
 * Example: 26235 -> 26,235 VND/USD
 */
export function formatExchangeRatePair(
  value: NullableNumber,
  fromCurrency: string,
  toCurrency = 'VND',
  maximumFractionDigits = 2,
) {
  if (!isValidNumber(value)) return FALLBACK;

  return `${formatExchangeRate(value, maximumFractionDigits)} ${toCurrency.toUpperCase()}/${fromCurrency.toUpperCase()}`;
}

export function formatCurrency(
  value: NullableNumber,
  currencyCode = 'VND',
  maximumFractionDigits = currencyCode.toUpperCase() === 'VND' ? 0 : 2,
) {
  const normalizedCurrency = currencyCode.toUpperCase();

  if (normalizedCurrency === 'VND') return formatVnd(value);
  if (normalizedCurrency === 'USD') return formatUsd(value, maximumFractionDigits);

  return formatForeignCurrency(value, normalizedCurrency, maximumFractionDigits);
}

export function formatNumber(value: NullableNumber, maximumFractionDigits = 2) {
  return formatExchangeRate(value, maximumFractionDigits);
}

export function formatDateTime(value: NullableDate) {
  const date = parseDate(value);
  if (!date) return typeof value === 'string' && value ? value : FALLBACK;

  return new Intl.DateTimeFormat('vi-VN', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  }).format(date);
}

export function formatTime(value: NullableDate) {
  const date = parseDate(value);
  if (!date) return typeof value === 'string' && value ? value : FALLBACK;

  return new Intl.DateTimeFormat('vi-VN', {
    hour: '2-digit',
    minute: '2-digit',
  }).format(date);
}
