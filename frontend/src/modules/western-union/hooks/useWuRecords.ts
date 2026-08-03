// Map /wu/transactions → TransactionRecord[] (shape bảng cũ) — dữ liệu THẬT
import { useWuTransactions } from './useWu';
import type { TransactionRecord } from '@/modules/transactions/model/transaction.types';

export function useWuRecords(): TransactionRecord[] {
  const { data = [] } = useWuTransactions();
  return data.map((w) => ({
    key: w.id,
    code: w.transactionNo,
    status: 'COMPLETED',
    shiftCode: '',
    createdAt: new Date(w.createdAt).toLocaleString('vi-VN'),
    createdBy: '',
    transactionType: w.receivedUsd > 0 ? 'RECEIVE_USD' : 'RECEIVE_VND',
    paidCurrency: 'USD',
    paidUsd: w.wuUsdAmount,
    paidVnd: w.wuVndAmount,
    wuRate: w.wuRate,
    appliedPaidRate: w.appliedRate,
    transactionRate: w.appliedRate,
    receivedUsd: w.receivedUsd,
    receivedVnd: w.receivedVnd,
    customerCode: w.mtcn,
    customerName: w.customerName ?? '',
    currency: 'USD',
    amount: w.wuUsdAmount,
    vndAmount: w.wuVndAmount,
  }));
}
