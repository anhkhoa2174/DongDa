export const shiftReconciliationMock = {
  vnd: {
    expected: 324_825_000,
    actual: 324_825_000,
    difference: 0,
    openingBalance: 325_000_000,
    lastCountedAt: '14:30',
  },
  usd: {
    expected: 47_200,
    actual: 47_200,
    difference: 0,
  },
};

export const shiftCashFlowMock = [
  { label: 'Số dư đầu ca', amount: 325_000_000, tone: 'neutral' },
  { label: '+ Thu từ mua NT', amount: 5_144_000, tone: 'in' },
  { label: '+ Pay In trong ca', amount: 200_000, tone: 'in' },
  { label: '- Chi WU/MG', amount: -5_144_000, tone: 'out' },
  { label: '- Pay Out', amount: -375_000, tone: 'out' },
  { label: '= Số dư hiện tại', amount: 324_825_000, tone: 'total' },
] as const;

export const shiftPayInOutMock = [
  { key: 'pio-001', time: '14:18', type: 'PAY_IN', amount: 200_000, reason: 'Cấp tiền lẻ từ Pay Out trước' },
  { key: 'pio-002', time: '11:42', type: 'PAY_OUT', amount: -150_000, reason: 'Mua văn phòng phẩm' },
  { key: 'pio-003', time: '10:15', type: 'PAY_OUT', amount: -225_000, reason: 'Phí ship tài liệu HQ' },
];

export const shiftHistoryMock = [
  { key: 's-001', date: '27/06', branch: 'NCT', cashier: 'Lan', openedAt: '08:05', closedAt: '—', transactionCount: 12, expectedVnd: 324_825_000, actualVnd: 324_825_000, diff: 0, status: 'OPEN' },
  { key: 's-002', date: '26/06', branch: 'NCT', cashier: 'Lan', openedAt: '08:02', closedAt: '17:18', transactionCount: 28, expectedVnd: 325_000_000, actualVnd: 325_000_000, diff: 0, status: 'MATCHED' },
  { key: 's-003', date: '26/06', branch: 'An Đông', cashier: 'Mai', openedAt: '08:10', closedAt: '17:30', transactionCount: 22, expectedVnd: 276_480_000, actualVnd: 276_300_000, diff: -180_000, status: 'LARGE_SHORTAGE' },
  { key: 's-004', date: '25/06', branch: 'Tao Đàn', cashier: 'Huệ', openedAt: '07:58', closedAt: '17:05', transactionCount: 18, expectedVnd: 187_395_000, actualVnd: 187_420_000, diff: 25_000, status: 'SMALL_SURPLUS' },
];
