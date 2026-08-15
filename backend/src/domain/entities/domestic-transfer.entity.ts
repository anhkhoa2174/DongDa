export type DomesticTransferType = 'CASH_TO_BANK' | 'BANK_TO_CASH';

export function domesticTransferPosting(type: DomesticTransferType, amount: number, fee: number) {
  return type === 'CASH_TO_BANK'
    ? { cashAmount: amount + fee, cashDirection: 'DEBIT' as const, bankDelta: -amount }
    : { cashAmount: amount - fee, cashDirection: 'CREDIT' as const, bankDelta: amount };
}

export interface DomesticTransferTransaction {
  id: string;
  transactionNo: string;
  branchId: string;
  shiftId: string;
  shiftCode?: string;
  businessDate: Date;
  status: string;
  transferType: DomesticTransferType;
  customerName?: string | null;
  customerPhone?: string | null;
  bankAccountId: string;
  bankAccountLabel: string;
  counterpartyBank?: string | null;
  counterpartyAccount?: string | null;
  amount: number;
  fee: number;
  cashAmount: number;
  transactionValueVnd: number;
  transferNote?: string | null;
  createdByUserId: string;
  createdAt: Date;
}
