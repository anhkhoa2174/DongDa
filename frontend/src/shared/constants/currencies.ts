export type CurrencyMetadata = {
  code: string;
  name: string;
  country: string;
};

export const CURRENCIES: CurrencyMetadata[] = [
  { code: 'VND', name: 'Việt Nam đồng', country: 'Việt Nam' },
  { code: 'USD', name: 'Đô la Mỹ', country: 'Hoa Kỳ' },
  { code: 'EUR', name: 'Euro', country: 'Khu vực đồng Euro' },
  { code: 'AUD', name: 'Đô la Úc', country: 'Úc' },
  { code: 'JPY', name: 'Yên Nhật', country: 'Nhật Bản' },
  { code: 'GBP', name: 'Bảng Anh', country: 'Vương quốc Anh' },
  { code: 'SGD', name: 'Đô la Singapore', country: 'Singapore' },
  { code: 'THB', name: 'Baht Thái', country: 'Thái Lan' },
  { code: 'CNY', name: 'Nhân dân tệ', country: 'Trung Quốc' },
  { code: 'HKD', name: 'Đô la Hồng Kông', country: 'Hồng Kông' },
  { code: 'KRW', name: 'Won Hàn Quốc', country: 'Hàn Quốc' },
  { code: 'CAD', name: 'Đô la Canada', country: 'Canada' },
  { code: 'CHF', name: 'Franc Thụy Sĩ', country: 'Thụy Sĩ' },
  { code: 'NZD', name: 'Đô la New Zealand', country: 'New Zealand' },
  { code: 'TWD', name: 'Đô la Đài Loan', country: 'Đài Loan' },
  { code: 'MYR', name: 'Ringgit Malaysia', country: 'Malaysia' },
  { code: 'IDR', name: 'Rupiah Indonesia', country: 'Indonesia' },
  { code: 'PHP', name: 'Peso Philippines', country: 'Philippines' },
  { code: 'LAK', name: 'Kip Lào', country: 'Lào' },
  { code: 'KHR', name: 'Riel Campuchia', country: 'Campuchia' },
];

const currencyByCode = new Map(CURRENCIES.map((currency) => [currency.code, currency]));

export function getCurrencyMetadata(code: string): CurrencyMetadata {
  const normalizedCode = String(code ?? '').toUpperCase();
  return currencyByCode.get(normalizedCode) ?? {
    code: normalizedCode,
    name: normalizedCode,
    country: 'Chưa cập nhật',
  };
}

export const currencyOptions = CURRENCIES.map((currency) => ({
  value: currency.code,
  label: `${currency.code} - ${currency.country}`,
}));
