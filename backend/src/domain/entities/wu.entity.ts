// Domain Entity: Giao dịch Western Union
// Layer: Domain
//
// Tạo 1 GD WU kéo theo:
//   - Trả khách (Pay Currency) → quỹ tiền mặt chi nhánh GIẢM (ledger CREDIT)
//   - WU nợ lại công ty (Paid Currency) → công nợ TĂNG
//   - Giá trị giao dịch quy đổi VND = receivedUsd × appliedRate + receivedVnd

export type Currency2 = 'USD' | 'VND';

export interface WuTransaction {
  id: string;
  transactionNo: string;
  branchId: string;
  bankAccountId: string;
  shiftId: string;
  businessDate: Date;
  status: string;
  debtStatus?: 'PENDING' | 'RECONCILED' | 'SETTLED' | 'CANCELLED';
  customerName?: string | null;
  customerPhone?: string | null;
  sendingCountry?: string | null;
  senderState?: string | null;
  receiverDateOfBirth?: Date | null;
  currentAddress?: string | null;
  identityAddress?: string | null;
  identityDocumentType?: string | null;
  identityDocumentNumber?: string | null;
  identityIssuingCountry?: string | null;
  identityIssueDate?: Date | null;
  identityExpiryDate?: Date | null;
  hasVisa: boolean;
  visaType?: string | null;
  visaNumber?: string | null;
  visaIssueDate?: Date | null;
  visaExpiryDate?: Date | null;
  employmentStatus?: string | null;
  countryOfBirth?: string | null;
  senderRelationship?: string | null;
  receivePurpose?: string | null;
  senderName?: string | null;
  receivedDate?: Date | null;
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
  payoutCurrency: Currency2; // loại tiền khách chọn nhận
  transactionValueVnd: number;
  createdByUserId: string;
  createdAt: Date;
}

export function wuImpliedRate(wuVnd: number, wuUsd: number): number {
  return wuUsd > 0 ? wuVnd / wuUsd : 0;
}
