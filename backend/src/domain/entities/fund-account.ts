export type CanonicalFundAccountType = 'CASH' | 'FUND_A';

export function canonicalFundAccount(currencyCode: string) {
  const currency = currencyCode.toUpperCase();
  const isBaseCash = currency === 'VND' || currency === 'USD';

  return {
    accountType: (isBaseCash ? 'CASH' : 'FUND_A') as CanonicalFundAccountType,
    code: `${isBaseCash ? 'CASH' : 'FUND_A'}_${currency}`,
    name: isBaseCash ? `Quỹ tiền mặt ${currency}` : `Quỹ A ${currency}`,
  };
}
