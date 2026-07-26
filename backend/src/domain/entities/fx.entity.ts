// Domain Entity: Mua/Bán ngoại tệ (FX)
// Layer: Domain
//
//   MUA (is_buy=true):  khách bán ngoại tệ cho công ty → Quỹ VND giảm, tồn ngoại tệ tăng
//   BÁN (is_buy=false): khách mua ngoại tệ từ công ty → Quỹ VND tăng, tồn ngoại tệ giảm
// BR-F5.6: không cho bán vượt tồn (tồn ngoại tệ không âm).

export type CurrencyCode =
  | 'VND' | 'USD' | 'EUR' | 'AUD' | 'JPY'
  | 'GBP' | 'SGD' | 'THB' | 'CNY' | 'HKD' | 'KRW';

export interface FxTransaction {
  id: string;
  transactionNo: string;
  branchId: string;
  shiftId: string;
  businessDate: Date;
  status: string;
  customerName?: string | null;
  isBuy: boolean;
  fxCurrency: CurrencyCode;
  fxAmount: number;
  rate: number;
  vndAmount: number; // = fxAmount × rate
  createdByUserId: string;
  createdAt: Date;
}
