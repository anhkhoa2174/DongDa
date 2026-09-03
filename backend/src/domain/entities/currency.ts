// Danh mục tiền tệ ISO 4217 hiện hành, đồng bộ từ SIX ngày 01/01/2026.
export const SUPPORTED_CURRENCIES = [
  'VND', 'USD', 'EUR', 'AUD', 'JPY', 'GBP', 'SGD', 'THB', 'CNY', 'HKD',
  'KRW', 'CAD', 'CHF', 'NZD', 'TWD', 'MYR', 'IDR', 'PHP', 'LAK', 'KHR',
  'AED', 'AFN', 'ALL', 'AMD', 'AOA', 'ARS', 'AWG', 'AZN', 'BAM', 'BBD',
  'BDT', 'BHD', 'BIF', 'BMD', 'BND', 'BOB', 'BRL', 'BSD', 'BTN', 'BWP',
  'BYN', 'BZD', 'CDF', 'CLP', 'COP', 'CRC', 'CUP', 'CVE', 'CZK', 'DJF',
  'DKK', 'DOP', 'DZD', 'EGP', 'ERN', 'ETB', 'FJD', 'FKP', 'GEL', 'GHS',
  'GIP', 'GMD', 'GNF', 'GTQ', 'GYD', 'HNL', 'HTG', 'HUF', 'ILS', 'INR',
  'IQD', 'IRR', 'ISK', 'JMD', 'JOD', 'KES', 'KGS', 'KMF', 'KPW', 'KWD',
  'KYD', 'KZT', 'LBP', 'LKR', 'LRD', 'LSL', 'LYD', 'MAD', 'MDL', 'MGA',
  'MKD', 'MMK', 'MNT', 'MOP', 'MRU', 'MUR', 'MVR', 'MWK', 'MXN', 'MZN',
  'NAD', 'NGN', 'NIO', 'NOK', 'NPR', 'OMR', 'PAB', 'PEN', 'PGK', 'PKR',
  'PLN', 'PYG', 'QAR', 'RON', 'RSD', 'RUB', 'RWF', 'SAR', 'SBD', 'SCR',
  'SDG', 'SEK', 'SHP', 'SLE', 'SOS', 'SRD', 'SSP', 'STN', 'SVC', 'SYP',
  'SZL', 'TJS', 'TMT', 'TND', 'TOP', 'TRY', 'TTD', 'TZS', 'UAH', 'UGX',
  'UYU', 'UYW', 'UZS', 'VED', 'VES', 'VUV', 'WST', 'XAF', 'XCD', 'XCG',
  'XOF', 'XPF', 'YER', 'ZAR', 'ZMW', 'ZWG',
] as const;

export type CurrencyCode = (typeof SUPPORTED_CURRENCIES)[number];

export const FOREIGN_CURRENCIES = SUPPORTED_CURRENCIES.filter(
  (currency): currency is Exclude<CurrencyCode, 'VND'> => currency !== 'VND',
);
