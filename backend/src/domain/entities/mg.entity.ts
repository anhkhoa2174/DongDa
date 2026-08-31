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
  debtStatus?: 'PENDING' | 'RECONCILED' | 'SETTLED' | 'CANCELLED';
  customerName?: string | null;
  customerPhone?: string | null;
  shiftCode?: string;
  referenceNo: string; // Reference Number MoneyGram
  mgUsdAmount: number;
  mgVndAmount: number;
  payoutCurrency: Currency2; // loại tiền trả khách
  payoutAmount: number; // số tiền trả khách
  receivedUsd: number; // USD thực chi cho khách
  receivedVnd: number; // VND thực chi cho khách, gồm phần lẻ USD quy đổi
  mgRate: number; // implied = mgVnd / mgUsd
  systemRate: number;
  appliedRate: number;
  paidCurrency: Currency2; // loại tiền MG hoàn → công nợ
  transactionValueVnd: number;
  createdByUserId: string;
  createdAt: Date;
}

export function mgImpliedRate(mgVnd: number, mgUsd: number): number {
  return mgUsd > 0 ? mgVnd / mgUsd : 0;
}
