export type PrimaryRateForm = {
  paidSell: number;
  paidSellAdjustment: string;
  paidBuy: number;
  paidBuyAdjustment: string;
  sell: number;
  sellAdjustment: string;
  buy: number;
  buyAdjustment: string;
  note?: string;
};

export type FundARateForm = {
  buyRate: number;
  sellRate: number;
  adjustment: string;
};

export type FundARate = {
  key: string;
  currency: string;
  name: string;
  buyRate: number;
  sellRate: number;
  adjustment: string;
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
