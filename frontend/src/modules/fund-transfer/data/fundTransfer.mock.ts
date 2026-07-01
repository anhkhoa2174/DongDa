import type { FundTransferCurrency, FundTransferSource } from '../model/fundTransfer.types';

export const fundTransferCurrencyOptions: Array<{ value: FundTransferCurrency; label: string; group: string }> = [
  { value: 'VND', label: 'VND - Tiền mặt', group: 'Tiền chính' },
  { value: 'USD', label: 'USD - Tiền mặt', group: 'Tiền chính' },
  { value: 'EUR', label: 'EUR - Quỹ A', group: 'Quỹ A' },
  { value: 'AUD', label: 'AUD - Quỹ A', group: 'Quỹ A' },
  { value: 'JPY', label: 'JPY - Quỹ A', group: 'Quỹ A' },
  { value: 'GBP', label: 'GBP - Quỹ A', group: 'Quỹ A' },
  { value: 'SGD', label: 'SGD - Quỹ A', group: 'Quỹ A' },
  { value: 'KRW', label: 'KRW - Quỹ A', group: 'Quỹ A' },
  { value: 'THB', label: 'THB - Quỹ A', group: 'Quỹ A' },
  { value: 'HKD', label: 'HKD - Quỹ A', group: 'Quỹ A' },
  { value: 'CNY', label: 'CNY - Quỹ A', group: 'Quỹ A' },
];

export const fundTransferSourceOptions: Array<{ value: FundTransferSource; label: string }> = [
  { value: 'CENTRAL_CASH', label: 'Quỹ Chung' },
  { value: 'BANK', label: 'Ngân hàng' },
  { value: 'BRANCH', label: 'Chi nhánh khác' },
];

export const fundTransferReasonOptions = [
  { value: 'LOW_CASH', label: 'Bổ sung hạn mức tiền mặt' },
  { value: 'SHIFT_NEED', label: 'Nhu cầu ca đang mở' },
  { value: 'FX_STOCK', label: 'Bổ sung Quỹ A' },
  { value: 'OTHER', label: 'Khác' },
];
