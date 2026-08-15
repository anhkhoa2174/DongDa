// Repository Interface: Quỹ & Điều chuyển (Port)
// Layer: Domain

import type {
  FundTransfer, FundAccountBalance, CurrencyCode, CentralFundSummary,
  CentralFundMovement, CentralCashMovementDirection, CentralFundSourceType,
  FundMovementHistoryItem, CentralFundConversion,
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

export interface CreateFundMovementInput {
  direction: CentralCashMovementDirection;
  sourceType: CentralFundSourceType;
  items: Array<{
    currencyCode: CurrencyCode;
    amount: number;
    bankAccountId?: string;
  }>;
  note?: string;
  createdByUserId: string;
  targetBranchId?: string;
}

export interface ListFundMovementHistoryFilter {
  branchId?: string;
  dateFrom?: Date;
  dateTo?: Date;
}

export interface ConvertCentralFundInput {
  items: Array<{ currencyCode: CurrencyCode; amount: number }>;
  note?: string;
  createdByUserId: string;
}

export interface IFundRepository {
  // Số dư quỹ (tính từ ledger)
  listBalances(branchId?: string): Promise<FundAccountBalance[]>;
  getBalance(fundAccountId: string): Promise<number>;
  getCentralSummary(): Promise<CentralFundSummary>;
  createFundMovement(input: CreateFundMovementInput): Promise<CentralFundMovement>;
  convertCentralFund(input: ConvertCentralFundInput): Promise<CentralFundConversion>;
  listMovementHistory(filter?: ListFundMovementHistoryFilter): Promise<FundMovementHistoryItem[]>;

  findHeadOfficeBranchId(): Promise<string | null>;

  // VND/USD ưu tiên CASH; ngoại tệ khác có thể nằm ở FUND_A.
  findTransferAccount(branchId: string, currency: CurrencyCode): Promise<{ id: string } | null>;

  createTransfer(input: CreateTransferInput): Promise<FundTransfer>;
  findTransferById(id: string): Promise<FundTransfer | null>;
  listTransfers(filter?: ListTransfersFilter): Promise<FundTransfer[]>;

  // Xác nhận: post ledger (CREDIT nguồn + DEBIT đích) trong 1 transaction
  confirmTransfer(id: string, confirmedByUserId: string): Promise<FundTransfer>;
  rejectTransfer(id: string, userId: string): Promise<FundTransfer>;
  cancelTransfer(id: string, createdByUserId: string): Promise<FundTransfer>;
}
