// Domain Entity: Mua/Bán ngoại tệ (FX)
// Layer: Domain
//
//   MUA (is_buy=true):  khách bán ngoại tệ cho công ty → Quỹ VND giảm, tồn ngoại tệ tăng
//   BÁN (is_buy=false): khách mua ngoại tệ từ công ty → Quỹ VND tăng, tồn ngoại tệ giảm
// BR-F5.6: không cho bán vượt tồn (tồn ngoại tệ không âm).

import type { CurrencyCode } from './currency';
export type { CurrencyCode } from './currency';

export interface FxTransaction {
  id: string;
  transactionNo: string;
  branchId: string;
  shiftId: string;
  businessDate: Date;
  status: string;
  customerName?: string | null;
  customerPhone?: string | null;
  shiftCode?: string;
  isBuy: boolean;
  fxCurrency: CurrencyCode;
  fxAmount: number;
  fractionalAmount: number;
  fractionalRate?: number | null;
  deductionVnd: number;
  rate: number;
  vndAmount: number;
  createdByUserId: string;
  createdAt: Date;
}

export function calculateFxVndAmount(input: {
  fxAmount: number;
  fractionalAmount?: number;
  rate: number;
  fractionalRate?: number;
  deductionVnd?: number;
}) {
  const fractionalAmount = Number(input.fractionalAmount ?? 0);
  const wholeAmount = input.fxAmount - fractionalAmount;
  const fractionalRate = Number(input.fractionalRate ?? input.rate);
  const deductionVnd = Math.round(Number(input.deductionVnd ?? 0));
  const grossVndAmount = Math.round(wholeAmount * input.rate + fractionalAmount * fractionalRate);
  return {
    grossVndAmount,
    deductionVnd,
    vndAmount: grossVndAmount - deductionVnd,
  };
}
