import type { FundARate, HistoricalFundARate, RateHistory } from '../model/exchangeRate.types';

export const primaryRatesMock = [
  { label: 'Paid (WU/MG) Bán', value: '25,650', adjustment: '±20', tone: 'gray' as const },
  { label: 'Paid Mua', value: '25,580', adjustment: '±20', tone: 'gray' as const },
  { label: 'Giá Bán', value: '25,720', adjustment: '±30', tone: 'gray' as const },
  { label: 'Giá Mua', value: '25,600', adjustment: '±30', tone: 'gray' as const },
];

export const activePaidRatesMock = {
  paidSell: 25650,
  paidBuy: 25580,
};

export const activeBankRateMock = {
  usdToVnd: 25720,
  bank: 'ACB',
  version: 'NH-20260626-01',
  approvedBy: 'Trần Văn Hùng (GĐ)',
  approvedAt: '26/06/2026 08:00',
};

export const fundARatesMock: FundARate[] = [
  { key: 'eur', currency: 'EUR', name: 'Euro', buyRate: 29000, sellRate: 29400, adjustment: '±100', updatedAt: '07:35' },
  { key: 'aud', currency: 'AUD', name: 'Australian Dollar', buyRate: 16650, sellRate: 17050, adjustment: '±80', updatedAt: '07:35' },
  { key: 'jpy', currency: 'JPY', name: 'Japanese Yen', buyRate: 167, sellRate: 174, adjustment: '±2', updatedAt: '07:35' },
  { key: 'gbp', currency: 'GBP', name: 'British Pound', buyRate: 33800, sellRate: 34400, adjustment: '±150', updatedAt: '07:35' },
  { key: 'sgd', currency: 'SGD', name: 'Singapore Dollar', buyRate: 19800, sellRate: 20200, adjustment: '±80', updatedAt: '07:35' },
  { key: 'krw', currency: 'KRW', name: 'Korean Won', buyRate: 18.2, sellRate: 20.1, adjustment: '±0.5', updatedAt: '07:35' },
  { key: 'thb', currency: 'THB', name: 'Thai Baht', buyRate: 735, sellRate: 770, adjustment: '±10', updatedAt: '07:35' },
  { key: 'hkd', currency: 'HKD', name: 'Hong Kong Dollar', buyRate: 3250, sellRate: 3340, adjustment: '±25', updatedAt: '07:35' },
  { key: 'cny', currency: 'CNY', name: 'Chinese Yuan', buyRate: 3520, sellRate: 3610, adjustment: '±25', updatedAt: '07:35' },
];

export const rateHistoryMock: RateHistory[] = [
  { key: '20260620-02', version: 'TG-20260620-02', effectiveFrom: '20/06/2026 07:42', effectiveTo: 'Hiện tại', paidSell: 25650, paidBuy: 25580, sell: 25720, buy: 25600, fundACount: 9, submittedBy: 'Nguyễn Minh Anh (KTTH)', approvedBy: 'Trần Văn Hùng (GĐ)', status: 'active' },
  { key: '20260619-02', version: 'TG-20260619-02', effectiveFrom: '19/06/2026 14:10', effectiveTo: '20/06/2026 07:41', paidSell: 25630, paidBuy: 25560, sell: 25700, buy: 25580, fundACount: 9, submittedBy: 'Nguyễn Minh Anh (KTTH)', approvedBy: 'Trần Văn Hùng (GĐ)', status: 'expired' },
  { key: '20260619-01', version: 'TG-20260619-01', effectiveFrom: '19/06/2026 07:38', effectiveTo: '19/06/2026 14:09', paidSell: 25610, paidBuy: 25540, sell: 25680, buy: 25560, fundACount: 9, submittedBy: 'Lê Thu Hà (KTTH)', approvedBy: 'Trần Văn Hùng (GĐ)', status: 'expired' },
  { key: '20260618-01', version: 'TG-20260618-01', effectiveFrom: '18/06/2026 07:45', effectiveTo: '19/06/2026 07:37', paidSell: 25590, paidBuy: 25520, sell: 25660, buy: 25540, fundACount: 9, submittedBy: 'Lê Thu Hà (KTTH)', approvedBy: 'Phạm Đức Long (GĐ)', status: 'expired' },
];

export const historicalFundARatesMock: HistoricalFundARate[] = [
  { key: 'eur', currency: 'EUR', buy: 29000, sell: 29400 },
  { key: 'aud', currency: 'AUD', buy: 16650, sell: 17050 },
  { key: 'jpy', currency: 'JPY', buy: 167, sell: 174 },
  { key: 'gbp', currency: 'GBP', buy: 33800, sell: 34400 },
  { key: 'sgd', currency: 'SGD', buy: 19800, sell: 20200 },
  { key: 'krw', currency: 'KRW', buy: 18.2, sell: 20.1 },
  { key: 'thb', currency: 'THB', buy: 735, sell: 770 },
  { key: 'hkd', currency: 'HKD', buy: 3250, sell: 3340 },
  { key: 'cny', currency: 'CNY', buy: 3520, sell: 3610 },
];
