export const SUPPORTED_CURRENCIES = [
  'VND', 'USD', 'EUR', 'AUD', 'JPY', 'GBP', 'SGD', 'THB', 'CNY', 'HKD', 'KRW',
  'CAD', 'CHF', 'NZD', 'TWD', 'MYR', 'IDR', 'PHP', 'LAK', 'KHR',
] as const;

export type CurrencyCode = (typeof SUPPORTED_CURRENCIES)[number];

export const FOREIGN_CURRENCIES = SUPPORTED_CURRENCIES.filter(
  (currency): currency is Exclude<CurrencyCode, 'VND'> => currency !== 'VND',
);

