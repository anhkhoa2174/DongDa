import type { AggregatedTransaction } from '../model/transaction.types';

export const aggregatedTransactionsMock: AggregatedTransaction[] = [
  { key: 'wu-001', code: 'WU000123', source: 'WU', type: 'Khách nhận USD', customerName: 'Nguyễn Văn Minh', amountLabel: 'USD 1.200', vndAmount: 30780000, branch: 'NCT', shiftCode: 'NCT-20260621-01', createdAt: '21/06/2026 09:15', status: 'COMPLETED' },
  { key: 'mg-001', code: 'MG000082', source: 'MG', type: 'Khách nhận USD', customerName: 'Lê Hoàng Nam', amountLabel: 'USD 850', vndAmount: 21760000, branch: 'NCT', shiftCode: 'NCT-20260621-01', createdAt: '21/06/2026 09:42', status: 'COMPLETED' },
  { key: 'dt-001', code: 'DT000510', source: 'DOMESTIC', type: 'Chuyển tiền đi', customerName: 'Ngô Minh Quân', amountLabel: '50.000.000 ₫', vndAmount: 50000000, branch: 'NCT', shiftCode: 'NCT-20260621-01', createdAt: '21/06/2026 09:32', status: 'COMPLETED' },
  { key: 'fx-001', code: 'FX000341', source: 'FX', type: 'Mua EUR', customerName: 'Võ Thanh Tùng', amountLabel: 'EUR 1.200', vndAmount: 34800000, branch: 'NCT', shiftCode: 'NCT-20260621-01', createdAt: '21/06/2026 08:55', status: 'COMPLETED' },
  { key: 'wu-002', code: 'WU000124', source: 'WU', type: 'Khách nhận VND', customerName: 'Trần Ngọc Anh', amountLabel: '18.400.000 ₫', vndAmount: 18400000, branch: 'NCT', shiftCode: 'NCT-20260621-01', createdAt: '21/06/2026 10:02', status: 'PENDING' },
  { key: 'dt-002', code: 'DT000511', source: 'DOMESTIC', type: 'Nhận tiền', customerName: 'Bùi Thảo Vy', amountLabel: '25.000.000 ₫', vndAmount: 25000000, branch: 'NCT', shiftCode: 'NCT-20260621-01', createdAt: '21/06/2026 10:40', status: 'PENDING' },
];
