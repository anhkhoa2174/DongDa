export type PrimaryRateForm = {
  paidSell: number;
  paidSellAdjustment: number;
  paidBuy: number;
  paidBuyAdjustment: number;
  bankRate: number;
  bankRateAdjustment: number;
  fxSell: number;
  fxSellAdjustment: number;
  fxBuy: number;
  fxBuyAdjustment: number;
  note?: string;
};

export type FundARateForm = {
  buyRate: number;
  sellRate: number;
  adjustment: number;
};

export type FundARate = {
  key: string;
  currency: string;
  name: string;
  buyRate: number;
  sellRate: number;
  adjustment: number;
  updatedAt: string;
};

export type RateHistory = {
  key: string;
  version: string;
  effectiveFrom: string;
  effectiveTo: string;
  paidSell: number;
  paidBuy: number;
  sell: number;
  buy: number;
  fundACount: number;
  submittedBy: string;
  approvedBy: string;
  status: 'active' | 'expired';
};

export type HistoricalFundARate = {
  key: string;
  currency: string;
  buy: number;
  sell: number;
};
