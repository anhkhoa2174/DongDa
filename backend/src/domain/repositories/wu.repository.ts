// Repository Interface: Western Union (Port)
// Layer: Domain

import type { WuTransaction, Currency2 } from '../entities/wu.entity';

export interface CreateWuInput {
  branchId: string;
  mtcn: string;
  customerName?: string;
  wuUsdAmount: number;
  wuVndAmount: number;
  receivedUsd: number;
  receivedVnd: number;
  appliedRate: number;
  systemRate: number; // snapshot (từ tỷ giá active)
  paidCurrency: Currency2;
  payoutCurrency: Currency2;
  createdByUserId: string;
}

export interface ListWuFilter {
  branchId?: string;
}

export interface IWuRepository {
  mtcnExists(mtcn: string): Promise<boolean>;
  create(input: CreateWuInput): Promise<WuTransaction>;
  findById(id: string): Promise<WuTransaction | null>;
  list(filter?: ListWuFilter): Promise<WuTransaction[]>;
}
