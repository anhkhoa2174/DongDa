// Repository Interface: Western Union (Port)
// Layer: Domain

import type { WuTransaction, Currency2 } from '../entities/wu.entity';

export interface CreateWuInput {
  branchId: string;
  mtcn: string;
  customerName?: string;
  customerPhone: string;
  sendingCountry: string;
  senderState?: string;
  receiverDateOfBirth: Date;
  currentAddress: string;
  identityAddress?: string;
  identityDocumentType: string;
  identityDocumentNumber: string;
  identityIssuingCountry: string;
  identityIssueDate: Date;
  identityExpiryDate: Date;
  hasVisa: boolean;
  visaType?: string;
  visaNumber?: string;
  visaIssueDate?: Date;
  visaExpiryDate?: Date;
  employmentStatus: string;
  countryOfBirth: string;
  senderRelationship: string;
  receivePurpose: string;
  senderName: string;
  receivedDate: Date;
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
