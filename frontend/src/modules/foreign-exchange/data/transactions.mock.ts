import type { TransactionRecord } from '@/modules/transactions/model/transaction.types';

export const foreignExchangeTransactionsMock: TransactionRecord[] = [
  { key: 'fx-001', code: 'FX000341', transactionType: 'BUY', customerName: 'Võ Thanh Tùng', currency: 'EUR', foreignAmount: 1200, rate: 29000, vndAmount: 34800000, status: 'COMPLETED', shiftCode: 'NCT-20260621-01', createdAt: '21/06/2026 08:55', createdBy: 'Nguyễn Thị Lan' },
  { key: 'fx-002', code: 'FX000342', transactionType: 'SELL', customerName: 'Đặng Mỹ Linh', currency: 'AUD', foreignAmount: 500, rate: 17050, vndAmount: 8525000, status: 'COMPLETED', shiftCode: 'NCT-20260621-01', createdAt: '21/06/2026 10:25', createdBy: 'Nguyễn Thị Lan' },
];
