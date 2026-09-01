export type DomesticTransferType = 'CASH_TO_BANK' | 'BANK_TO_CASH';
export type DomesticTransferFeePaymentMethod = 'CASH' | 'BANK';

export function domesticTransferPosting(
  type: DomesticTransferType,
  amount: number,
  fee: number,
  feePaymentMethod: DomesticTransferFeePaymentMethod,
) {
  if (type === 'CASH_TO_BANK') {
    return feePaymentMethod === 'CASH'
      ? { cashAmount: amount + fee, cashDirection: 'DEBIT' as const, bankDelta: -amount }
      : { cashAmount: amount, cashDirection: 'DEBIT' as const, bankDelta: -(amount - fee) };
  }
  return feePaymentMethod === 'CASH'
    ? { cashAmount: amount - fee, cashDirection: 'CREDIT' as const, bankDelta: amount }
    : { cashAmount: amount, cashDirection: 'CREDIT' as const, bankDelta: amount + fee };
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
  transferReference?: string | null;
  amount: number;
  fee: number;
  feePaymentMethod: DomesticTransferFeePaymentMethod;
  cashAmount: number;
  transactionValueVnd: number;
  transferNote?: string | null;
  createdByUserId: string;
  createdAt: Date;
}
