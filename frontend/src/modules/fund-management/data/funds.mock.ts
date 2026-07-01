import type { BranchFund, CentralFund, FundACurrencyBalance } from '../model/fund.types';

const buildFundA = (items: Array<Omit<FundACurrencyBalance, 'vndValue'>>) =>
  items.map((item) => ({ ...item, vndValue: Math.round(item.amount * item.buyRate) }));

export const centralFundMock: CentralFund = {
  vndCash: 1_400_020_000,
  usdCash: 187_420,
  bankBalance: 8_235_300_000,
  debtVnd: 84_000_000,
  debtUsd: 37_520.64,
  lastReconciledAt: '26/06/2026 16:55',
  fundA: buildFundA([
    { currency: 'EUR', name: 'Euro', amount: 18_450, buyRate: 29_000 },
    { currency: 'AUD', name: 'Australian Dollar', amount: 12_800, buyRate: 16_650 },
    { currency: 'JPY', name: 'Japanese Yen', amount: 4_250_000, buyRate: 167 },
    { currency: 'GBP', name: 'British Pound', amount: 6_240, buyRate: 33_800 },
    { currency: 'SGD', name: 'Singapore Dollar', amount: 9_600, buyRate: 19_800 },
  ]),
};

export const branchFundsMock: BranchFund[] = [
  {
    key: 'nct',
    branchName: 'Chi nhánh Nguyễn Chí Thanh',
    manager: 'Lê Thu Hà',
    vndCash: 420_000_000,
    usdCash: 28_450,
    todayIn: 620_000_000,
    todayOut: 585_000_000,
    pendingFundTransfer: 120_000_000,
    lastCashCountAt: '26/06/2026 16:20',
    status: 'NORMAL',
    openShift: { code: 'NCT-20260626-01', cashier: 'Nguyễn Thị Lan', openedAt: '26/06/2026 08:00' },
    fundA: buildFundA([
      { currency: 'EUR', name: 'Euro', amount: 3_200, buyRate: 29_000 },
      { currency: 'AUD', name: 'Australian Dollar', amount: 1_850, buyRate: 16_650 },
      { currency: 'JPY', name: 'Japanese Yen', amount: 620_000, buyRate: 167 },
      { currency: 'GBP', name: 'British Pound', amount: 420, buyRate: 33_800 },
    ]),
  },
  {
    key: 'xd',
    branchName: 'Chi nhánh Xã Đàn',
    manager: 'Trần Minh Quân',
    vndCash: 285_500_000,
    usdCash: 16_780,
    todayIn: 410_000_000,
    todayOut: 455_000_000,
    pendingFundTransfer: 80_000_000,
    lastCashCountAt: '26/06/2026 15:45',
    status: 'LOW_CASH',
    openShift: { code: 'XD-20260626-01', cashier: 'Phạm Thanh Mai', openedAt: '26/06/2026 08:15' },
    fundA: buildFundA([
      { currency: 'EUR', name: 'Euro', amount: 2_150, buyRate: 29_000 },
      { currency: 'SGD', name: 'Singapore Dollar', amount: 3_200, buyRate: 19_800 },
      { currency: 'THB', name: 'Thai Baht', amount: 118_000, buyRate: 735 },
    ]),
  },
  {
    key: 'cg',
    branchName: 'Chi nhánh Cầu Giấy',
    manager: 'Vũ Hoàng Nam',
    vndCash: 615_250_000,
    usdCash: 34_920,
    todayIn: 780_000_000,
    todayOut: 640_000_000,
    pendingFundTransfer: 0,
    lastCashCountAt: '26/06/2026 16:10',
    status: 'NORMAL',
    openShift: { code: 'CG-20260626-01', cashier: 'Đỗ Minh Anh', openedAt: '26/06/2026 07:55' },
    fundA: buildFundA([
      { currency: 'EUR', name: 'Euro', amount: 4_600, buyRate: 29_000 },
      { currency: 'AUD', name: 'Australian Dollar', amount: 2_400, buyRate: 16_650 },
      { currency: 'CNY', name: 'Chinese Yuan', amount: 86_000, buyRate: 3_520 },
      { currency: 'HKD', name: 'Hong Kong Dollar', amount: 22_000, buyRate: 3_250 },
    ]),
  },
  {
    key: 'hm',
    branchName: 'Chi nhánh Hoàng Mai',
    manager: 'Ngô Bảo Trâm',
    vndCash: 198_300_000,
    usdCash: 9_840,
    todayIn: 240_000_000,
    todayOut: 300_000_000,
    pendingFundTransfer: 150_000_000,
    lastCashCountAt: '26/06/2026 13:30',
    status: 'NEEDS_RECONCILIATION',
    openShift: null,
    fundA: buildFundA([
      { currency: 'EUR', name: 'Euro', amount: 980, buyRate: 29_000 },
      { currency: 'JPY', name: 'Japanese Yen', amount: 350_000, buyRate: 167 },
      { currency: 'KRW', name: 'Korean Won', amount: 4_600_000, buyRate: 18.2 },
    ]),
  },
];
