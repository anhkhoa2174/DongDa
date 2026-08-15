import { BadRequestException } from '@nestjs/common';
import { canonicalActiveFundAccount } from './canonical-fund-account';

function databaseMock() {
  return {
    fund_accounts: {
      findUnique: jest.fn(),
      findFirst: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
    },
  };
}

describe('canonicalActiveFundAccount', () => {
  it('reuses the active account for the same branch and currency', async () => {
    const db = databaseMock();
    const account = {
      id: 'account-eur', code: 'FUND_A_EUR', account_type: 'FUND_A',
      currency_code: 'EUR', status: 'ACTIVE',
    };
    db.fund_accounts.findUnique.mockResolvedValue(account);

    await expect(canonicalActiveFundAccount(db, 'branch-1', 'EUR', true)).resolves.toBe(account);
    expect(db.fund_accounts.create).not.toHaveBeenCalled();
  });

  it('reactivates the same canonical account instead of creating another currency account', async () => {
    const db = databaseMock();
    const inactive = {
      id: 'old-eur', code: 'FUND_A_EUR', account_type: 'FUND_A',
      currency_code: 'EUR', status: 'INACTIVE',
    };
    db.fund_accounts.findUnique.mockResolvedValue(inactive);
    db.fund_accounts.update.mockResolvedValue({ ...inactive, status: 'ACTIVE' });

    await expect(canonicalActiveFundAccount(db, 'branch-1', 'EUR', true))
      .resolves.toEqual(expect.objectContaining({ id: 'old-eur', status: 'ACTIVE' }));
    expect(db.fund_accounts.update).toHaveBeenCalledWith(expect.objectContaining({
      where: { id: 'old-eur' },
      data: expect.objectContaining({ status: 'ACTIVE' }),
    }));
    expect(db.fund_accounts.create).not.toHaveBeenCalled();
  });

  it('creates only the canonical account when the currency is new', async () => {
    const db = databaseMock();
    db.fund_accounts.findUnique.mockResolvedValue(null);
    db.fund_accounts.findFirst.mockResolvedValue(null);
    db.fund_accounts.create.mockImplementation(({ data }: any) => ({ id: 'new-eur', status: 'ACTIVE', ...data }));

    const account = await canonicalActiveFundAccount(db, 'branch-1', 'EUR', true);

    expect(account.code).toBe('FUND_A_EUR');
    expect(db.fund_accounts.create).toHaveBeenCalledTimes(1);
    expect(db.fund_accounts.create).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({ branch_id: 'branch-1', currency_code: 'EUR', account_type: 'FUND_A' }),
    }));
  });
});
