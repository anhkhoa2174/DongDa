// Repository Interface: MoneyGram (Port)
// Layer: Domain

import type { MgTransaction, Currency2 } from '../entities/mg.entity';

export interface CreateMgInput {
  branchId: string;
  referenceNo: string;
  customerName?: string;
  mgUsdAmount: number;
  mgVndAmount: number;
  payoutCurrency: Currency2;
  payoutAmount: number;
  appliedRate: number;
  systemRate: number;
  paidCurrency: Currency2;
  createdByUserId: string;
}

export interface ListMgFilter {
  branchId?: string;
}

export interface IMgRepository {
  create(input: CreateMgInput): Promise<MgTransaction>;
  findById(id: string): Promise<MgTransaction | null>;
  list(filter?: ListMgFilter): Promise<MgTransaction[]>;
  referenceExists(referenceNo: string): Promise<boolean>;
}
