// Domain Entity: Giao dịch Western Union
// Layer: Domain
//
// Tạo 1 GD WU kéo theo:
//   - Trả khách (Pay Currency) → quỹ tiền mặt chi nhánh GIẢM (ledger CREDIT)
//   - WU nợ lại công ty (Paid Currency) → công nợ TĂNG
//   - Lợi nhuận = (WU Implied Rate − Applied Rate) × USD  (tính khi đọc)

export type Currency2 = 'USD' | 'VND';

export interface WuTransaction {
  id: string;
  transactionNo: string;
  branchId: string;
  shiftId: string;
  businessDate: Date;
  status: string;
  customerName?: string | null;
  customerPhone?: string | null;
  shiftCode?: string;
  mtcn: string; // MSKH Western Union (10 số)
  wuUsdAmount: number;
  wuVndAmount: number;
  receivedUsd: number; // trả khách USD
  receivedVnd: number; // trả khách VND
  wuRate: number; // implied = wuVnd / wuUsd
  systemRate: number; // snapshot tỷ giá công ty tại thời điểm
  appliedRate: number;
  paidCurrency: Currency2; // loại tiền WU hoàn lại → công nợ
  profit: number; // (wuRate − appliedRate) × wuUsd
  createdByUserId: string;
  createdAt: Date;
}

export function wuImpliedRate(wuVnd: number, wuUsd: number): number {
  return wuUsd > 0 ? wuVnd / wuUsd : 0;
}

export function wuProfit(wuRate: number, appliedRate: number, wuUsd: number): number {
  return (wuRate - appliedRate) * wuUsd;
}
