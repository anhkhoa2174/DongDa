import type { TransactionRecord } from '@/modules/transactions/model/transaction.types';

export const westernUnionTransactionsMock: TransactionRecord[] = [
  { key: 'wu-001', code: 'WU000123', transactionType: 'RECEIVE_USD', paidCurrency: 'USD', paidUsd: 1200, paidVnd: 30780000, wuRate: 25650, appliedPaidRate: 25650, transactionRate: 25650, receivedUsd: 1200, receivedVnd: 0, customerCode: '1234567890', customerName: 'Nguyễn Văn Minh', phone: '0909123456', bank: 'ACB', currency: 'USD', amount: 1200, vndAmount: 30780000, status: 'COMPLETED', shiftCode: 'NCT-20260621-01', createdAt: '21/06/2026 09:15', createdBy: 'Nguyễn Thị Lan' },
  { key: 'wu-002', code: 'WU000124', transactionType: 'RECEIVE_VND', paidCurrency: 'VND', paidUsd: 719.31, paidVnd: 18400000, wuRate: 25580, appliedPaidRate: 25580, transactionRate: 25580, receivedUsd: 0, receivedVnd: 18400000, customerCode: '9876543210', customerName: 'Trần Ngọc Anh', phone: '0918222333', bank: 'MSB', currency: 'VND', amount: 18400000, vndAmount: 18400000, status: 'PENDING', shiftCode: 'NCT-20260621-01', createdAt: '21/06/2026 10:02', createdBy: 'Nguyễn Thị Lan' },
];
