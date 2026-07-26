// Domain Entity: Giao dịch MoneyGram
// Layer: Domain
//
// Giống Western Union, khác: khóa = Reference Number (không phải MSKH).
// BR-F4.5: 1 Reference Number chỉ được xử lý một lần.

export type Currency2 = 'USD' | 'VND';

export interface MgTransaction {
  id: string;
  transactionNo: string;
  branchId: string;
  shiftId: string;
  businessDate: Date;
  status: string;
  customerName?: string | null;
  referenceNo: string; // Reference Number MoneyGram
  mgUsdAmount: number;
  mgVndAmount: number;
  payoutCurrency: Currency2; // loại tiền trả khách
  payoutAmount: number; // số tiền trả khách
  mgRate: number; // implied = mgVnd / mgUsd
  systemRate: number;
  appliedRate: number;
  paidCurrency: Currency2; // loại tiền MG hoàn → công nợ
  profit: number;
  createdByUserId: string;
  createdAt: Date;
}

export function mgImpliedRate(mgVnd: number, mgUsd: number): number {
  return mgUsd > 0 ? mgVnd / mgUsd : 0;
}

export function mgProfit(mgRate: number, appliedRate: number, mgUsd: number): number {
  return (mgRate - appliedRate) * mgUsd;
}
