// Domain Entity: ExchangeRate (Tỷ giá)
// Layer: Domain
//
// Vòng đời (Flow 1 — Duyệt tỷ giá):
//   DRAFT (KTTH tạo) → ACTIVE (GĐ/KTTH duyệt, supersede bản cũ) hoặc REJECTED
// Quy tắc BR-F2.3-01: tại một thời điểm chỉ 1 tỷ giá ACTIVE cho mỗi
//   (rate_type + provider + from_currency + to_currency).

export enum ExchangeRateType {
  PAID_BUY = 'PAID_BUY', // áp dụng cho WU/MG khi khách nhận VND
  PAID_SELL = 'PAID_SELL', // áp dụng cho WU/MG khi khách nhận USD
  BANK_RATE = 'BANK_RATE', // tỷ giá ngân hàng xử lý phần lẻ công nợ USD
  WU_SYSTEM = 'WU_SYSTEM', // legacy
  WU_PROVIDER = 'WU_PROVIDER',
  MG_SYSTEM = 'MG_SYSTEM',
  FX_BUY = 'FX_BUY', // mua ngoại tệ từ khách
  FX_SELL = 'FX_SELL', // bán ngoại tệ cho khách
}

export enum RateStatus {
  DRAFT = 'DRAFT', // chờ duyệt
  ACTIVE = 'ACTIVE', // đang áp dụng
  SUPERSEDED = 'SUPERSEDED', // đã bị bản mới thay
  REJECTED = 'REJECTED', // bị từ chối
}

export enum ServiceProvider {
  WU_MG = 'WU_MG',
  WU = 'WU',
  MG = 'MG',
  BANK = 'BANK',
  INTERNAL = 'INTERNAL',
}

import type { CurrencyCode } from './currency';
export type { CurrencyCode } from './currency';

export interface ExchangeRate {
  id: string;
  rateType: ExchangeRateType;
  provider?: ServiceProvider | null;
  fromCurrency: CurrencyCode;
  toCurrency: CurrencyCode;
  buyRate?: number | null;
  sellRate?: number | null;
  rate: number;
  effectiveFrom: Date;
  effectiveTo?: Date | null;
  status: RateStatus;
  createdByUserId: string;
  approvedByUserId?: string | null;
  approvedAt?: Date | null;
  createdAt: Date;
  updatedAt: Date;
}

// Khóa xác định "cùng một loại tỷ giá" — dùng để supersede bản active cũ
export interface RateIdentity {
  rateType: ExchangeRateType;
  provider?: ServiceProvider | null;
  fromCurrency: CurrencyCode;
  toCurrency: CurrencyCode;
}

export function rateIdentityOf(r: ExchangeRate): RateIdentity {
  return {
    rateType: r.rateType,
    provider: r.provider ?? null,
    fromCurrency: r.fromCurrency,
    toCurrency: r.toCurrency,
  };
}

// Chỉ được duyệt/từ chối khi còn ở DRAFT
export function canApprove(rate: ExchangeRate): boolean {
  return rate.status === RateStatus.DRAFT;
}
