// Repository Interface: Quỹ & Điều chuyển (Port)
// Layer: Domain

import type {
  FundTransfer, FundAccountBalance, CurrencyCode,
} from '../entities/fund.entity';

export interface CreateTransferInput {
  sourceBranchId: string;
  destinationBranchId: string;
  currencyCode: CurrencyCode;
  amount: number;
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

  // Tìm sổ quỹ tiền mặt của 1 chi nhánh theo loại tiền
  findCashAccount(branchId: string, currency: CurrencyCode): Promise<{ id: string } | null>;

  createTransfer(input: CreateTransferInput): Promise<FundTransfer>;
  findTransferById(id: string): Promise<FundTransfer | null>;
  listTransfers(filter?: ListTransfersFilter): Promise<FundTransfer[]>;

  // Xác nhận: post ledger (CREDIT nguồn + DEBIT đích) trong 1 transaction
  confirmTransfer(id: string, confirmedByUserId: string): Promise<FundTransfer>;
  rejectTransfer(id: string, userId: string): Promise<FundTransfer>;
}
