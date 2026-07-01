import type { TransactionRecord } from '@/modules/transactions/model/transaction.types';

export const domesticTransferTransactionsMock: TransactionRecord[] = [
  { key: 'dt-001', code: 'DT000510', transactionType: 'OUTGOING', customerName: 'Ngô Minh Quân', phone: '0907333444', bank: 'ACB', accountNumber: '123456789', amount: 50000000, fee: 50000, vndAmount: 50050000, status: 'COMPLETED', shiftCode: 'NCT-20260621-01', createdAt: '21/06/2026 09:32', createdBy: 'Nguyễn Thị Lan' },
  { key: 'dt-002', code: 'DT000511', transactionType: 'INCOMING', customerName: 'Bùi Thảo Vy', phone: '0915666777', bank: 'MSB', accountNumber: '9988776655', amount: 25000000, fee: 0, vndAmount: 25000000, status: 'PENDING', shiftCode: 'NCT-20260621-01', createdAt: '21/06/2026 10:40', createdBy: 'Nguyễn Thị Lan' },
];
