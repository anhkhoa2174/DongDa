import { canonicalFundAccount } from './fund-account';

describe('canonicalFundAccount', () => {
  it.each(['VND', 'USD'])('maps %s to the single cash account', (currency) => {
    expect(canonicalFundAccount(currency)).toEqual({
      accountType: 'CASH',
      code: `CASH_${currency}`,
      name: `Quỹ tiền mặt ${currency}`,
    });
  });

  it.each(['EUR', 'KRW', 'CAD'])('maps %s to the single Fund A account', (currency) => {
    expect(canonicalFundAccount(currency)).toEqual({
      accountType: 'FUND_A',
      code: `FUND_A_${currency}`,
      name: `Quỹ A ${currency}`,
    });
  });

  it('normalizes currency codes before creating the identity', () => {
    expect(canonicalFundAccount('eur').code).toBe('FUND_A_EUR');
  });
});

