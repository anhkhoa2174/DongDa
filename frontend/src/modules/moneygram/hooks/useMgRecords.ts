// Map /mg/transactions → TransactionRecord[] (shape bảng cũ) — dữ liệu THẬT
import { useMgTransactions } from './useMg';
import type { TransactionRecord } from '@/modules/transactions/model/transaction.types';

export function useMgRecords(): TransactionRecord[] {
  const { data = [] } = useMgTransactions();
  return data.map((m) => ({
    key: m.id,
    code: m.transactionNo,
    status: 'COMPLETED',
    shiftCode: '',
    createdAt: new Date(m.createdAt).toLocaleString('vi-VN'),
    createdBy: '',
    transactionType: m.payoutCurrency === 'USD' ? 'RECEIVE_USD' : 'RECEIVE_VND',
    paidCurrency: 'USD',
    paidUsd: m.mgUsdAmount,
    paidVnd: m.mgVndAmount,
    wuRate: m.mgRate,
    appliedPaidRate: m.appliedRate,
    transactionRate: m.appliedRate,
    referenceNumber: m.referenceNo,
    customerCode: m.referenceNo,
    customerName: m.customerName ?? '',
    currency: 'USD',
    amount: m.mgUsdAmount,
    vndAmount: m.mgVndAmount,
  }));
}
