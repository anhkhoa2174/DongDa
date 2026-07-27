// Map /fx/transactions → TransactionRecord[] (shape bảng cũ) — dữ liệu THẬT
import { useFxTransactions } from './useFx';
import type { TransactionRecord } from '@/modules/transactions/model/transaction.types';

export function useFxRecords(): TransactionRecord[] {
  const { data = [] } = useFxTransactions();
  return data.map((f) => ({
    key: f.id,
    code: f.transactionNo,
    status: 'COMPLETED',
    shiftCode: '',
    createdAt: new Date(f.createdAt).toLocaleString('vi-VN'),
    createdBy: '',
    tradeType: f.isBuy ? 'BUY' : 'SELL',
    fxCurrency: f.fxCurrency,
    fxAmount: f.fxAmount,
    rate: f.rate,
    customerName: f.customerName ?? '',
    currency: f.fxCurrency,
    amount: f.fxAmount,
    vndAmount: f.vndAmount,
  }));
}
