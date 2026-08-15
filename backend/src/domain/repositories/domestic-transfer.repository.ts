import type { DomesticTransferTransaction, DomesticTransferType } from '../entities/domestic-transfer.entity';

export interface CreateDomesticTransferInput {
  branchId: string;
  transferType: DomesticTransferType;
  bankAccountId: string;
  customerName?: string;
  customerPhone?: string;
  counterpartyBank?: string;
  counterpartyAccount?: string;
  amount: number;
  fee: number;
  transferNote?: string;
  createdByUserId: string;
}

export interface ListDomesticTransferFilter { branchId?: string; }

export interface DomesticTransferBankAccount {
  id: string;
  bankCode: string;
  bankName: string;
  accountNo: string;
  accountName: string;
  currentBalance: number;
}

export interface IDomesticTransferRepository {
  create(input: CreateDomesticTransferInput): Promise<DomesticTransferTransaction>;
  list(filter?: ListDomesticTransferFilter): Promise<DomesticTransferTransaction[]>;
  findById(id: string): Promise<DomesticTransferTransaction | null>;
  listBankAccounts(): Promise<DomesticTransferBankAccount[]>;
}
