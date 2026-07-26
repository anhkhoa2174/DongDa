export type FundTransferCurrency = 'VND' | 'USD' | 'EUR' | 'AUD' | 'JPY' | 'GBP' | 'SGD' | 'KRW' | 'THB' | 'HKD' | 'CNY';

export type FundTransferSource = 'CENTRAL_CASH' | 'BANK' | 'BRANCH';

export type FundTransferItem = {
  currency: FundTransferCurrency;
  amount: number;
  source: FundTransferSource;
  note?: string;
};

export type FundTransferFormValues = {
  branchId: string;
  requestedBy?: string;
  reason: string;
  items: FundTransferItem[];
};
