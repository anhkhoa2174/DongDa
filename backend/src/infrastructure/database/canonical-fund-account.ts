import { BadRequestException } from '@nestjs/common';
import type { CurrencyCode } from '../../domain/entities/currency';
import { canonicalFundAccount } from '../../domain/entities/fund-account';

type FundAccountRecord = {
  id: string;
  code: string;
  account_type: string;
  currency_code: string;
  status: string;
};

export function canonicalActiveFundAccount(
  db: any,
  branchId: string,
  currency: CurrencyCode,
  createIfMissing: true,
): Promise<FundAccountRecord>;
export function canonicalActiveFundAccount(
  db: any,
  branchId: string,
  currency: CurrencyCode,
  createIfMissing?: false,
): Promise<FundAccountRecord | null>;
export function canonicalActiveFundAccount(
  db: any,
  branchId: string,
  currency: CurrencyCode,
  createIfMissing: boolean,
): Promise<FundAccountRecord | null>;
export async function canonicalActiveFundAccount(
  db: any,
  branchId: string,
  currency: CurrencyCode,
  createIfMissing = false,
): Promise<FundAccountRecord | null> {
  const identity = canonicalFundAccount(currency);
  const accountByCode = await db.fund_accounts.findUnique({
    where: { branch_id_code: { branch_id: branchId, code: identity.code } },
    select: { id: true, code: true, account_type: true, currency_code: true, status: true },
  });

  if (accountByCode) {
    if (accountByCode.status !== 'ACTIVE') {
      throw new BadRequestException(`Sổ quỹ ${currency} đang ngừng hoạt động`);
    }
    if (accountByCode.currency_code !== currency || accountByCode.account_type !== identity.accountType) {
      throw new BadRequestException(`Sổ quỹ ${currency} đang có cấu hình không hợp lệ`);
    }
    return accountByCode;
  }

  const activeForCurrency = await db.fund_accounts.findFirst({
    where: {
      branch_id: branchId,
      currency_code: currency,
      account_type: { in: ['CASH', 'FUND_A'] },
      status: 'ACTIVE',
    },
    select: { id: true, code: true, account_type: true, currency_code: true, status: true },
  });
  if (activeForCurrency) return activeForCurrency;
  if (!createIfMissing) return null;

  return db.fund_accounts.create({
    data: {
      branch_id: branchId,
      code: identity.code,
      name: identity.name,
      account_type: identity.accountType,
      currency_code: currency,
    },
    select: { id: true, code: true, account_type: true, currency_code: true, status: true },
  });
}
