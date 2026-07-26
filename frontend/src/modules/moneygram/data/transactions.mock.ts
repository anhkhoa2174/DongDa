import type { TransactionRecord } from '@/modules/transactions/model/transaction.types';

export const moneyGramTransactionsMock: TransactionRecord[] = [
  { key: 'mg-001', code: 'MG000082', transactionType: 'RECEIVE_USD', paidCurrency: 'USD', paidUsd: 850, receivedUsd: 850, mgRate: 25600, appliedPaidRate: 25650, transactionRate: 25650, customerCode: '12345678', customerName: 'Lê Hoàng Nam', phone: '0908111222', currency: 'USD', amount: 850, vndAmount: 21802500, status: 'COMPLETED', shiftCode: 'NCT-20260621-01', createdAt: '21/06/2026 09:42', createdBy: 'Nguyễn Thị Lan' },
  { key: 'mg-002', code: 'MG000083', transactionType: 'RECEIVE_VND', paidCurrency: 'VND', paidVnd: 9600000, receivedVnd: 9600000, mgRate: 25580, appliedPaidRate: 25580, transactionRate: 25580, customerCode: '87654321', customerName: 'Phạm Thu Hương', phone: '0933444555', currency: 'VND', amount: 9600000, vndAmount: 9600000, status: 'COMPLETED', shiftCode: 'NCT-20260621-01', createdAt: '21/06/2026 10:18', createdBy: 'Nguyễn Thị Lan' },
];
