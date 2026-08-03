// Repository Interface: Quỹ & Điều chuyển (Port)
// Layer: Domain

import type {
  FundTransfer, FundAccountBalance, CurrencyCode, CentralFundSummary,
} from '../entities/fund.entity';

export interface CreateTransferInput {
  sourceBranchId: string;
  destinationBranchId: string;
  items: Array<{
    currencyCode: CurrencyCode;
    amount: number;
  }>;
  createdByUserId: string;
}

export interface ListTransfersFilter {
  branchId?: string; // liên quan (gửi hoặc nhận)
  status?: string;
}

export interface IFundRepository {
  // Số dư quỹ (tính từ ledger)
  listBalances(branchId?: string): Promise<FundAccountBalance[]>;
  getBalance(fundAccountId: string): Promise<number>;
  getCentralSummary(): Promise<CentralFundSummary>;

  findHeadOfficeBranchId(): Promise<string | null>;

  // VND/USD ưu tiên CASH; ngoại tệ khác có thể nằm ở FUND_A.
  findTransferAccount(branchId: string, currency: CurrencyCode): Promise<{ id: string } | null>;

  createTransfer(input: CreateTransferInput): Promise<FundTransfer>;
  findTransferById(id: string): Promise<FundTransfer | null>;
  listTransfers(filter?: ListTransfersFilter): Promise<FundTransfer[]>;

  // Xác nhận: post ledger (CREDIT nguồn + DEBIT đích) trong 1 transaction
  confirmTransfer(id: string, confirmedByUserId: string): Promise<FundTransfer>;
  rejectTransfer(id: string, userId: string): Promise<FundTransfer>;
}
