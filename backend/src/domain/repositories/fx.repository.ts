// Repository Interface: FX (Port)
// Layer: Domain

import type { FxTransaction, CurrencyCode } from '../entities/fx.entity';

export interface CreateFxInput {
  branchId: string;
  isBuy: boolean;
  fxCurrency: CurrencyCode;
  fxAmount: number;
  rate: number;
  customerName?: string;
  createdByUserId: string;
}

export interface ListFxFilter {
  branchId?: string;
}

export interface IFxRepository {
  create(input: CreateFxInput): Promise<FxTransaction>;
  findById(id: string): Promise<FxTransaction | null>;
  list(filter?: ListFxFilter): Promise<FxTransaction[]>;
  // Tồn ngoại tệ (theo chi nhánh) — để hiển thị + kiểm soát bán vượt tồn
  currencyStock(branchId?: string): Promise<{ branchId: string; currency: CurrencyCode; balance: number }[]>;
}
