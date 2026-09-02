// Prisma Fund Repository — số dư quỹ (từ ledger) + điều chuyển vốn
// Layer: Infrastructure

import { Injectable, BadRequestException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma.service';
import { toVietnamBusinessDate } from '../business-date';
import {
  IFundRepository, ConvertCentralFundInput, CreateTransferInput, ListFundMovementHistoryFilter, ListTransfersFilter,
} from '../../../domain/repositories/fund.repository';
import {
  FundTransfer, FundTransferStatus, FundAccountBalance, CurrencyCode, CentralFundSummary,
  CentralFundMovement, FundMovementHistoryItem, CentralFundConversion, calculateCentralFundConversionValue,
} from '../../../domain/entities/fund.entity';
import type { CreateFundMovementInput } from '../../../domain/repositories/fund.repository';
import { canonicalFundAccount } from '../../../domain/entities/fund-account';
import { canonicalActiveFundAccount } from '../canonical-fund-account';
import { NotificationService } from '../../notifications/notification.service';
import { claimFinancialRequest, completeFinancialRequest } from '../financial-idempotency';

const CURRENCY_NAMES: Partial<Record<CurrencyCode, string>> = {
  VND: 'Việt Nam đồng', USD: 'Đô la Mỹ', EUR: 'Euro', AUD: 'Đô la Úc', JPY: 'Yên Nhật',
  GBP: 'Bảng Anh', SGD: 'Đô la Singapore', THB: 'Baht Thái', CNY: 'Nhân dân tệ',
  HKD: 'Đô la Hong Kong', KRW: 'Won Hàn Quốc', CAD: 'Đô la Canada', CHF: 'Franc Thụy Sĩ',
  NZD: 'Đô la New Zealand', TWD: 'Đài tệ', MYR: 'Ringgit Malaysia', IDR: 'Rupiah Indonesia',
  PHP: 'Peso Philippines', LAK: 'Kip Lào', KHR: 'Riel Campuchia',
};

@Injectable()
export class PrismaFundRepository implements IFundRepository {
  constructor(
    private readonly prisma: PrismaService,
    private readonly notifications: NotificationService,
  ) {}

  async listBalances(branchId?: string): Promise<FundAccountBalance[]> {
    const accounts = await this.prisma.fund_accounts.findMany({
      where: { status: 'ACTIVE', ...(branchId && { branch_id: branchId }) },
      orderBy: [{ branch_id: 'asc' }, { code: 'asc' }],
    });
    const ids = accounts.map((a) => a.id);
    const balByAcc = await this.balancesFor(ids);
    const balances = new Map<string, FundAccountBalance>();
    for (const account of accounts) {
      const currency = account.currency_code as CurrencyCode;
      const isPhysicalFund = account.account_type === 'CASH' || account.account_type === 'FUND_A';
      const key = isPhysicalFund
        ? `${account.branch_id}:PHYSICAL:${currency}`
        : `${account.branch_id}:${account.account_type}:${account.id}`;
      const identity = isPhysicalFund ? canonicalFundAccount(currency) : null;
      const current = balances.get(key);
      balances.set(key, {
        id: current?.id ?? account.id,
        branchId: account.branch_id,
        code: identity?.code ?? account.code,
        name: identity?.name ?? account.name,
        accountType: identity?.accountType ?? account.account_type,
        currencyCode: currency,
        balance: (current?.balance ?? 0) + (balByAcc.get(account.id) ?? 0),
      });
    }
    return [...balances.values()].sort((left, right) => left.branchId.localeCompare(right.branchId)
      || left.currencyCode.localeCompare(right.currencyCode)
      || left.code.localeCompare(right.code));
  }

  async getBalance(fundAccountId: string): Promise<number> {
    const m = await this.balancesFor([fundAccountId]);
    return m.get(fundAccountId) ?? 0;
  }

  async getCentralSummary(): Promise<CentralFundSummary> {
    const now = new Date();
    const businessDate = toVietnamBusinessDate(now);
    const weekday = businessDate.getUTCDay();
    const weekStartedAt = new Date(businessDate);
    weekStartedAt.setUTCDate(weekStartedAt.getUTCDate() - (weekday === 0 ? 6 : weekday - 1));
    const [accounts, bankAccounts, debtAccounts, rates, lastReconciliation, openingFundLines, weeklyBankMovements] = await Promise.all([
      this.prisma.fund_accounts.findMany({
        where: { status: 'ACTIVE', account_type: { in: ['CASH', 'FUND_A'] } },
        include: { branches: { select: { type: true } } },
      }),
      this.prisma.bank_accounts.findMany({
        where: { status: 'ACTIVE' },
        select: { current_balance: true, currency_code: true },
      }),
      this.prisma.debt_accounts.findMany({
        where: { status: 'ACTIVE' },
        include: {
          debt_movements: {
            where: { status: 'POSTED' },
            select: { movement_type: true, amount: true, effective_at: true },
          },
        },
      }),
      this.prisma.exchange_rates.findMany({
        where: {
          status: 'ACTIVE',
          to_currency: 'VND',
          effective_from: { lte: now },
          OR: [{ effective_to: null }, { effective_to: { gt: now } }],
          rate_type: { in: ['PAID_BUY', 'FX_BUY', 'BANK_RATE'] },
        },
        orderBy: { effective_from: 'desc' },
      }),
      this.prisma.reconciliation_runs.findFirst({
        where: { status: { in: ['MATCHED', 'APPROVED', 'POSTED'] } },
        orderBy: { updated_at: 'desc' },
        select: { updated_at: true },
      }),
      this.prisma.ledger_lines.findMany({
        where: {
          ledger_entries: { status: 'POSTED', business_date: { lt: weekStartedAt } },
          fund_accounts: { status: 'ACTIVE', account_type: { in: ['CASH', 'FUND_A'] } },
        },
        select: {
          fund_account_id: true,
          direction: true,
          amount: true,
          currency_code: true,
        },
      }),
      this.prisma.bank_balance_movements.findMany({
        where: {
          status: 'POSTED',
          business_date: { gte: weekStartedAt },
          bank_accounts: { status: 'ACTIVE' },
        },
        select: { balance_before: true, balance_after: true, currency_code: true },
      }),
    ]);

    const balances = await this.balancesFor(accounts.map((account) => account.id));
    const rateByCurrency = new Map<CurrencyCode, number>();
    let hasPaidBuyUsd = false;
    for (const rate of rates) {
      const currency = rate.from_currency as CurrencyCode;
      const isPreferredUsdRate = currency === 'USD' && rate.rate_type === 'PAID_BUY' && !hasPaidBuyUsd;
      if (!rateByCurrency.has(currency) || isPreferredUsdRate) {
        rateByCurrency.set(currency, Number(rate.rate));
      }
      if (isPreferredUsdRate) hasPaidBuyUsd = true;
    }
    rateByCurrency.set('VND', 1);
    const missingRates = new Set<CurrencyCode>();
    const conversionRate = (currency: CurrencyCode) => {
      const rate = rateByCurrency.get(currency) ?? 0;
      if (currency !== 'VND' && rate <= 0) missingRates.add(currency);
      return rate;
    };

    let vndCash = 0;
    let usdCash = 0;
    let branchFundVnd = 0;
    let branchFundUsd = 0;
    let branchFundValueVnd = 0;
    const fundAByCurrency = new Map<CurrencyCode, number>();
    for (const account of accounts) {
      const currency = account.currency_code as CurrencyCode;
      const balance = balances.get(account.id) ?? 0;
      const valueVnd = balance === 0 ? 0 : balance * conversionRate(currency);
      if (account.branches.type === 'BRANCH') {
        if (currency === 'VND') branchFundVnd += balance;
        if (currency === 'USD') branchFundUsd += balance;
        branchFundValueVnd += valueVnd;
        continue;
      }
      if (account.account_type === 'CASH' && currency === 'VND') vndCash += balance;
      else if (account.account_type === 'CASH' && currency === 'USD') usdCash += balance;
      else if (account.account_type === 'FUND_A') {
        fundAByCurrency.set(currency, (fundAByCurrency.get(currency) ?? 0) + balance);
      }
    }

    const fundA = Array.from(fundAByCurrency.entries())
      .filter(([, amount]) => amount !== 0)
      .map(([currency, amount]) => {
        const buyRate = conversionRate(currency);
        return {
          currency,
          name: CURRENCY_NAMES[currency] ?? currency,
          amount,
          buyRate,
          vndValue: amount * buyRate,
        };
      })
      .sort((a, b) => a.currency.localeCompare(b.currency));
    const fundAValueVnd = fundA.reduce((sum, item) => sum + item.vndValue, 0);
    const paidBuyRate = conversionRate('USD');
    const usdCashValueVnd = usdCash * paidBuyRate;
    const centralCashValueVnd = vndCash + usdCashValueVnd + fundAValueVnd;
    let bankVnd = 0;
    let bankUsd = 0;
    const bankValueVnd = bankAccounts.reduce((sum, account) => {
      const currency = account.currency_code as CurrencyCode;
      const balance = Number(account.current_balance);
      if (currency === 'VND') bankVnd += balance;
      if (currency === 'USD') bankUsd += balance;
      return sum + (balance === 0 ? 0 : balance * conversionRate(currency));
    }, 0);

    let debtVnd = 0;
    let debtUsd = 0;
    let debtValueVnd = 0;
    let openingDebtValueVnd = 0;
    for (const account of debtAccounts) {
      const currency = account.currency_code as CurrencyCode;
      const outstanding = account.debt_movements.reduce((sum, movement) => {
        const amount = Number(movement.amount);
        if (movement.movement_type === 'EXPECTED_DEBT' || movement.movement_type === 'ACTUAL_DEBT') return sum + amount;
        if (movement.movement_type === 'SETTLEMENT' || movement.movement_type === 'REVERSAL') return sum - amount;
        return sum;
      }, 0);
      if (currency === 'VND') debtVnd += outstanding;
      if (currency === 'USD') debtUsd += outstanding;
      if (outstanding !== 0) debtValueVnd += outstanding * conversionRate(currency);
      const openingOutstanding = account.debt_movements.reduce((sum, movement) => {
        if (movement.effective_at >= weekStartedAt) return sum;
        const amount = Number(movement.amount);
        if (movement.movement_type === 'EXPECTED_DEBT' || movement.movement_type === 'ACTUAL_DEBT') return sum + amount;
        if (movement.movement_type === 'SETTLEMENT' || movement.movement_type === 'REVERSAL') return sum - amount;
        return sum;
      }, 0);
      openingDebtValueVnd += openingOutstanding * conversionRate(currency);
    }

    const openingFundBalances = new Map<string, { currency: CurrencyCode; balance: number }>();
    for (const line of openingFundLines) {
      const current = openingFundBalances.get(line.fund_account_id) ?? {
        currency: line.currency_code as CurrencyCode,
        balance: 0,
      };
      const amount = Number(line.amount);
      current.balance += line.direction === 'DEBIT' ? amount : -amount;
      openingFundBalances.set(line.fund_account_id, current);
    }
    const openingFundValueVnd = Array.from(openingFundBalances.values()).reduce(
      (sum, item) => sum + item.balance * conversionRate(item.currency),
      0,
    );
    const weeklyBankChangeVnd = weeklyBankMovements.reduce((sum, movement) => {
      const change = Number(movement.balance_after) - Number(movement.balance_before);
      return sum + change * conversionRate(movement.currency_code as CurrencyCode);
    }, 0);
    const openingBankValueVnd = bankValueVnd - weeklyBankChangeVnd;
    const totalCompanyFundVnd = centralCashValueVnd + bankValueVnd + branchFundValueVnd + debtValueVnd;
    const openingTotalCompanyFundVnd = openingFundValueVnd + openingBankValueVnd + openingDebtValueVnd;
    const weeklyCapitalChangeVnd = totalCompanyFundVnd - openingTotalCompanyFundVnd;

    return {
      calculatedAt: now,
      lastReconciledAt: lastReconciliation?.updated_at ?? null,
      paidBuyRate,
      vndCash,
      usdCash,
      usdCashValueVnd,
      fundA,
      fundAValueVnd,
      centralCashValueVnd,
      bankVnd,
      bankUsd,
      bankValueVnd,
      debtVnd,
      debtUsd,
      debtValueVnd,
      branchFundVnd,
      branchFundUsd,
      branchFundValueVnd,
      totalCompanyFundVnd,
      weekStartedAt,
      weeklyCapitalChangeVnd,
      weeklyCapitalChangePercent: openingTotalCompanyFundVnd !== 0
        ? (weeklyCapitalChangeVnd / Math.abs(openingTotalCompanyFundVnd)) * 100
        : null,
      missingRateCurrencies: Array.from(missingRates).sort(),
    };
  }

  async createFundMovement(input: CreateFundMovementInput): Promise<CentralFundMovement> {
    const now = new Date();
    const voucherNo = `${input.direction === 'IN' ? 'PT' : 'PC'}-${Date.now()}-${Math.floor(Math.random() * 1000)}`;
    const idempotencyScope = `FUND_MOVEMENT_CREATE:${input.createdByUserId}`;

    return this.prisma.$transaction(async (tx) => {
      const replay = await claimFinancialRequest<CentralFundMovement>(
        tx, idempotencyScope, input.idempotencyKey, input,
      );
      if (replay) return { ...replay, postedAt: new Date(String(replay.postedAt)) };

      const targetBranch = await tx.branch.findFirst({
        where: input.targetBranchId
          ? { id: input.targetBranchId, status: 'ACTIVE' }
          : { type: 'HEAD_OFFICE', status: 'ACTIVE' },
        orderBy: { created_at: 'asc' },
        select: { id: true, name: true, type: true },
      });
      if (!targetBranch) {
        throw new BadRequestException(input.targetBranchId
          ? 'Không tìm thấy chi nhánh đang hoạt động'
          : 'Chưa cấu hình chi nhánh Hội sở (HO)');
      }
      const fundLabel = targetBranch.type === 'HEAD_OFFICE' ? 'Quỹ Chung' : `Quỹ ${targetBranch.name}`;

      const itemKeys = input.items.map((item) => input.sourceType === 'BANK' ? item.bankAccountId : item.currencyCode);
      if (itemKeys.some((key) => !key)) {
        throw new BadRequestException('Mỗi khoản ngân hàng phải chọn một tài khoản');
      }
      if (new Set(itemKeys).size !== itemKeys.length) {
        throw new BadRequestException(input.sourceType === 'BANK'
          ? 'Mỗi tài khoản ngân hàng chỉ được thêm một lần trong phiếu'
          : 'Mỗi loại tiền chỉ được thêm một lần trong phiếu');
      }

      const resultItems: CentralFundMovement['items'] = [];
      for (const [index, item] of input.items.entries()) {
        if (input.sourceType === 'BANK') {
          const bankAccount = await tx.bank_accounts.findFirst({
            where: { id: item.bankAccountId, branch_id: targetBranch.id, status: 'ACTIVE' },
          });
          if (!bankAccount) throw new BadRequestException('Không tìm thấy tài khoản ngân hàng của chi nhánh đang hoạt động');
          if (bankAccount.currency_code !== item.currencyCode) {
            throw new BadRequestException(
              `Tài khoản ngân hàng ${bankAccount.account_no} sử dụng ${bankAccount.currency_code}, không phải ${item.currencyCode}`,
            );
          }

          await this.lockBankAccount(tx, bankAccount.id);
          const lockedBankAccount = await tx.bank_accounts.findUniqueOrThrow({ where: { id: bankAccount.id } });
          const balanceBefore = Number(lockedBankAccount.current_balance);
          if (input.direction === 'OUT' && item.amount > balanceBefore) {
            throw new BadRequestException(
              `Số dư tài khoản ${bankAccount.account_no} không đủ (còn ${balanceBefore} ${item.currencyCode})`,
            );
          }
          const balanceAfter = balanceBefore + (input.direction === 'IN' ? item.amount : -item.amount);
          const movement = await tx.bank_balance_movements.create({
            data: {
              movement_no: `${voucherNo}-${String(index + 1).padStart(2, '0')}`,
              bank_account_id: bankAccount.id,
              branch_id: bankAccount.branch_id,
              movement_type: input.direction === 'IN' ? 'DEPOSIT' : 'WITHDRAW',
              business_date: toVietnamBusinessDate(now),
              occurred_at: now,
              amount: item.amount,
              currency_code: item.currencyCode,
              balance_before: balanceBefore,
              balance_after: balanceAfter,
              description: input.note ?? (input.direction === 'IN' ? `Thu vào ${fundLabel}` : `Chi từ ${fundLabel}`),
              status: 'POSTED',
              created_by_user_id: input.createdByUserId,
              approved_by_user_id: input.createdByUserId,
              posted_at: now,
            },
          });
          await tx.bank_accounts.update({
            where: { id: bankAccount.id },
            data: { current_balance: balanceAfter, available_balance: balanceAfter },
          });
          resultItems.push({
            id: movement.id,
            movementNo: movement.movement_no,
            currencyCode: item.currencyCode,
            amount: item.amount,
            bankAccountId: bankAccount.id,
          });
          continue;
        }

        const account = await canonicalActiveFundAccount(
          tx,
          targetBranch.id,
          item.currencyCode,
          input.direction === 'IN',
        );
        if (!account) throw new BadRequestException(`${fundLabel} chưa có sổ ${item.currencyCode} để thực hiện chi`);

        await this.lockFundAccount(tx, account.id);
        if (input.direction === 'OUT') {
          const currentBalance = await this.balance(tx, account.id);
          if (item.amount > currentBalance) {
            throw new BadRequestException(
              `Số dư ${fundLabel} không đủ (còn ${currentBalance} ${item.currencyCode})`,
            );
          }
        }

        const exchangeRate = await this.activeConversionRate(tx, item.currencyCode);
        const movement = await tx.cash_movements.create({
          data: {
            movement_no: `${voucherNo}-${String(index + 1).padStart(2, '0')}`,
            branch_id: targetBranch.id,
            fund_account_id: account.id,
            movement_type: input.direction === 'IN' ? 'CASH_IN' : 'CASH_OUT',
            business_date: toVietnamBusinessDate(now),
            amount: item.amount,
            currency_code: item.currencyCode,
            source_name: 'Tiền mặt',
            description: input.note ?? null,
            status: 'POSTED',
            approved_by_user_id: input.createdByUserId,
            created_by_user_id: input.createdByUserId,
            posted_at: now,
          },
        });

        await tx.ledger_entries.create({
          data: {
            entry_no: `LE-${movement.movement_no}`,
            business_date: toVietnamBusinessDate(now),
            branch_id: targetBranch.id,
            source_type: 'CASH_MOVEMENT',
            source_id: movement.id,
            status: 'POSTED',
            posted_at: now,
            description: `${input.direction === 'IN' ? 'Thu tiền mặt' : 'Chi tiền mặt'}${input.note ? ` - ${input.note}` : ''}`,
            created_by_user_id: input.createdByUserId,
            approved_by_user_id: input.createdByUserId,
            ledger_lines: {
              create: [{
                fund_account_id: account.id,
                direction: input.direction === 'IN' ? 'DEBIT' : 'CREDIT',
                amount: item.amount,
                currency_code: item.currencyCode,
                exchange_rate: exchangeRate,
                base_amount_vnd: item.amount * exchangeRate,
              }],
            },
          },
        });
        resultItems.push({
          id: movement.id,
          movementNo: movement.movement_no,
          currencyCode: item.currencyCode,
          amount: item.amount,
        });
      }

      const sourceType = targetBranch.type === 'HEAD_OFFICE'
        ? 'CENTRAL_FUND_MOVEMENT'
        : 'BRANCH_FUND_MOVEMENT';
      await this.notifications.notifyUsers({
        title: `${input.direction === 'IN' ? 'Phiếu thu' : 'Phiếu chi'} ${voucherNo} đã ghi sổ`,
        body: `${fundLabel}: ${resultItems.map((item) => `${item.amount} ${item.currencyCode}`).join(', ')}${input.note ? ` - ${input.note}` : ''}`,
        sourceType,
        sourceId: resultItems[0]?.id ?? null,
      }, {
        userIds: [input.createdByUserId],
        roles: ['ADMIN', 'MANAGER'],
        ...(targetBranch.type === 'BRANCH' && { branchIds: [targetBranch.id] }),
      }, tx);

      const result: CentralFundMovement = {
        voucherNo,
        direction: input.direction,
        sourceType: input.sourceType,
        items: resultItems,
        note: input.note ?? null,
        postedAt: now,
      };
      await completeFinancialRequest(tx, idempotencyScope, input.idempotencyKey, result);
      return result;
    });
  }

  async convertCentralFund(input: ConvertCentralFundInput): Promise<CentralFundConversion> {
    const now = new Date();
    const businessDate = toVietnamBusinessDate(now);
    const voucherNo = `QDA-${Date.now()}-${Math.floor(Math.random() * 1000)}`;

    const currencies = input.items.map((item) => item.currencyCode);
    if (new Set(currencies).size !== currencies.length) {
      throw new BadRequestException('Mỗi loại ngoại tệ chỉ được thêm một lần trong phiếu quy đổi');
    }
    const conversionItems = [...input.items].sort((a, b) => a.currencyCode.localeCompare(b.currencyCode));

    return this.prisma.$transaction(async (tx) => {
      const headOffice = await tx.branch.findFirst({
        where: { type: 'HEAD_OFFICE', status: 'ACTIVE' },
        orderBy: { created_at: 'asc' },
        select: { id: true },
      });
      if (!headOffice) throw new BadRequestException('Chưa cấu hình chi nhánh Hội sở (HO)');

      const vndAccount = await canonicalActiveFundAccount(tx, headOffice.id, 'VND');
      if (!vndAccount) throw new BadRequestException('Quỹ Chung chưa có sổ tiền mặt VND');

      await this.lockFundAccount(tx, vndAccount.id);
      const resultItems: CentralFundConversion['items'] = [];
      let firstMovementId: string | null = null;

      for (const [index, item] of conversionItems.entries()) {
        const foreignAccount = await canonicalActiveFundAccount(tx, headOffice.id, item.currencyCode);
        if (!foreignAccount) throw new BadRequestException(`Quỹ A Hội sở chưa có sổ ${item.currencyCode}`);
        await this.lockFundAccount(tx, foreignAccount.id);
        const available = await this.balance(tx, foreignAccount.id);
        if (item.amount > available) {
          throw new BadRequestException(`Quỹ A không đủ ${item.currencyCode} (còn ${available})`);
        }

        if (!Number.isFinite(item.rate) || item.rate <= 0) {
          throw new BadRequestException(`Tỷ giá ${item.currencyCode} phải lớn hơn 0`);
        }
        if (!Number.isFinite(item.deduction) || item.deduction < 0) {
          throw new BadRequestException(`Khấu trừ ${item.currencyCode} không được âm`);
        }
        const rate = item.rate;
        const { grossVndAmount, deduction, vndAmount } = calculateCentralFundConversionValue(
          item.amount,
          rate,
          item.deduction,
        );
        if (deduction >= grossVndAmount) {
          throw new BadRequestException(`Khấu trừ ${item.currencyCode} phải nhỏ hơn thành tiền trước khấu trừ`);
        }
        const description = input.note
          ? `Bán Quỹ A ${item.currencyCode}: ${item.amount} x ${rate}, khấu trừ ${deduction} VND, thực thu ${vndAmount} VND - ${input.note}`
          : `Bán Quỹ A ${item.currencyCode}: ${item.amount} x ${rate}, khấu trừ ${deduction} VND, thực thu ${vndAmount} VND`;
        const foreignMovement = await tx.cash_movements.create({
          data: {
            movement_no: `${voucherNo}-${String(index + 1).padStart(2, '0')}-OUT`,
            branch_id: headOffice.id, fund_account_id: foreignAccount.id,
            movement_type: 'CASH_OUT', business_date: businessDate, amount: item.amount,
            currency_code: item.currencyCode, source_name: 'Bán ngoại tệ Quỹ A', description,
            status: 'POSTED', created_by_user_id: input.createdByUserId,
            approved_by_user_id: input.createdByUserId, posted_at: now,
          },
        });
        firstMovementId ??= foreignMovement.id;
        await tx.ledger_entries.create({
          data: {
            entry_no: `LE-${voucherNo}-${String(index + 1).padStart(2, '0')}-OUT`,
            business_date: businessDate, branch_id: headOffice.id,
            source_type: 'CASH_MOVEMENT', source_id: foreignMovement.id, status: 'POSTED', posted_at: now,
            description, created_by_user_id: input.createdByUserId, approved_by_user_id: input.createdByUserId,
            ledger_lines: { create: [{
              fund_account_id: foreignAccount.id, direction: 'CREDIT', amount: item.amount,
              currency_code: item.currencyCode, exchange_rate: rate, base_amount_vnd: vndAmount,
            }] },
          },
        });
        resultItems.push({
          currencyCode: item.currencyCode,
          amount: item.amount,
          rate,
          grossVndAmount,
          deduction,
          vndAmount,
        });
      }

      const totalVndAmount = resultItems.reduce((sum, item) => sum + item.vndAmount, 0);
      const description = input.note ? `Thu VND từ bán ngoại tệ Quỹ A - ${input.note}` : 'Thu VND từ bán ngoại tệ Quỹ A';
      const vndMovement = await tx.cash_movements.create({
        data: {
          movement_no: `${voucherNo}-IN`, branch_id: headOffice.id, fund_account_id: vndAccount.id,
          movement_type: 'CASH_IN', business_date: businessDate, amount: totalVndAmount,
          currency_code: 'VND', source_name: 'Bán ngoại tệ Quỹ A', description,
          status: 'POSTED', created_by_user_id: input.createdByUserId,
          approved_by_user_id: input.createdByUserId, posted_at: now,
        },
      });
      await tx.ledger_entries.create({
        data: {
          entry_no: `LE-${voucherNo}-IN`, business_date: businessDate, branch_id: headOffice.id,
          source_type: 'CASH_MOVEMENT', source_id: vndMovement.id, status: 'POSTED', posted_at: now,
          description, created_by_user_id: input.createdByUserId, approved_by_user_id: input.createdByUserId,
          ledger_lines: { create: [{
            fund_account_id: vndAccount.id, direction: 'DEBIT', amount: totalVndAmount,
            currency_code: 'VND', exchange_rate: 1, base_amount_vnd: totalVndAmount,
          }] },
        },
      });
      await this.notifications.notifyUsers({
        title: `Phiếu bán ngoại tệ Quỹ A ${voucherNo} đã ghi sổ`,
        body: `${resultItems.map((item) => `${item.amount} ${item.currencyCode} x ${item.rate} - ${item.deduction} VND`).join('; ')} = ${totalVndAmount} VND`,
        sourceType: 'CENTRAL_FUND_CONVERSION',
        sourceId: firstMovementId,
      }, { userIds: [input.createdByUserId], roles: ['ADMIN', 'MANAGER'] }, tx);

      return {
        voucherNo, items: resultItems, totalVndAmount,
        note: input.note ?? null, postedAt: now,
      };
    });
  }

  async listMovementHistory(
    filter?: ListFundMovementHistoryFilter,
  ): Promise<FundMovementHistoryItem[]> {
    const createdAt = {
      ...(filter?.dateFrom && { gte: filter.dateFrom }),
      ...(filter?.dateTo && { lte: filter.dateTo }),
    };
    const hasDateFilter = Boolean(filter?.dateFrom || filter?.dateTo);
    const [cashMovements, bankMovements, transfers] = await Promise.all([
      this.prisma.cash_movements.findMany({
        where: {
          ...(filter?.branchId && { branch_id: filter.branchId }),
          ...(hasDateFilter && { created_at: createdAt }),
        },
        orderBy: { created_at: 'desc' },
        take: 200,
      }),
      this.prisma.bank_balance_movements.findMany({
        where: {
          ...(filter?.branchId && { branch_id: filter.branchId }),
          ...(hasDateFilter && { occurred_at: createdAt }),
        },
        orderBy: { occurred_at: 'desc' },
        take: 200,
      }),
      this.prisma.fund_transfers.findMany({
        where: {
          ...(filter?.branchId && {
            OR: [
              { source_branch_id: filter.branchId },
              { destination_branch_id: filter.branchId },
            ],
          }),
          ...(hasDateFilter && { created_at: createdAt }),
        },
        include: { fund_transfer_items: true },
        orderBy: { created_at: 'desc' },
        take: 200,
      }),
    ]);

    const history: FundMovementHistoryItem[] = [
      ...cashMovements.map((movement) => ({
        id: movement.id,
        documentNo: fundVoucherNo(movement.movement_no),
        kind: movement.movement_type === 'CASH_IN' ? 'RECEIPT' as const : 'EXPENSE' as const,
        sourceType: 'CASH' as const,
        branchId: movement.branch_id,
        currencyCode: movement.currency_code as CurrencyCode,
        amount: Number(movement.amount),
        status: movement.status,
        note: movement.description,
        occurredAt: movement.posted_at ?? movement.created_at,
      })),
      ...bankMovements.map((movement) => {
        const isIncoming = movement.movement_type === 'DEPOSIT' || movement.movement_type === 'TRANSFER_IN';
        return {
          id: movement.id,
          documentNo: fundVoucherNo(movement.movement_no),
          kind: isIncoming ? 'RECEIPT' as const : 'EXPENSE' as const,
          sourceType: 'BANK' as const,
          branchId: movement.branch_id,
          currencyCode: movement.currency_code as CurrencyCode,
          amount: Number(movement.amount),
          status: movement.status,
          note: movement.description,
          occurredAt: movement.occurred_at,
        };
      }),
      ...transfers.flatMap((transfer) => {
        const incoming = Boolean(filter?.branchId && transfer.destination_branch_id === filter.branchId);
        return transfer.fund_transfer_items.map((item) => ({
          id: item.id,
          documentNo: transfer.transfer_no,
          kind: incoming ? 'TRANSFER_IN' as const : 'TRANSFER_OUT' as const,
          sourceType: 'FUND_TRANSFER' as const,
          branchId: incoming ? transfer.destination_branch_id : transfer.source_branch_id,
          counterpartyBranchId: incoming ? transfer.source_branch_id : transfer.destination_branch_id,
          currencyCode: item.currency_code as CurrencyCode,
          amount: Number(item.amount),
          status: transfer.status,
          note: 'Tiếp quỹ / điều chuyển vốn',
          occurredAt: transfer.confirmed_at ?? transfer.created_at,
        }));
      }),
    ];

    return history
      .sort((left, right) => right.occurredAt.getTime() - left.occurredAt.getTime())
      .slice(0, 300);
  }

  async findHeadOfficeBranchId(): Promise<string | null> {
    const branch = await this.prisma.branch.findFirst({
      where: { type: 'HEAD_OFFICE', status: 'ACTIVE' },
      select: { id: true },
      orderBy: { created_at: 'asc' },
    });
    return branch?.id ?? null;
  }

  async findTransferAccount(branchId: string, currency: CurrencyCode) {
    return canonicalActiveFundAccount(this.prisma, branchId, currency);
  }

  async createTransfer(input: CreateTransferInput): Promise<FundTransfer> {
    if (input.sourceBranchId === input.destinationBranchId) {
      throw new BadRequestException('Chi nhánh gửi và nhận phải khác nhau');
    }
    const currencies = input.items.map((item) => item.currencyCode);
    if (new Set(currencies).size !== currencies.length) {
      throw new BadRequestException('Mỗi loại tiền chỉ được xuất hiện một lần trong phiếu tiếp quỹ');
    }

    const row = await this.prisma.$transaction(async (tx) => {
      const resolvedItems: Array<{
        source_account_id: string;
        destination_account_id: string;
        currency_code: CurrencyCode;
        amount: number;
      }> = [];
      for (const item of input.items) {
        const source = await canonicalActiveFundAccount(tx, input.sourceBranchId, item.currencyCode);
        const destination = await canonicalActiveFundAccount(tx, input.destinationBranchId, item.currencyCode, true);
        if (!source) throw new BadRequestException(`Đơn vị gửi chưa có sổ quỹ ${item.currencyCode}`);
        const sourceBalance = await this.balance(tx, source.id);
        if (item.amount > sourceBalance) {
          throw new BadRequestException(`Số dư ${item.currencyCode} không đủ (còn ${sourceBalance})`);
        }
        resolvedItems.push({
          source_account_id: source.id,
          destination_account_id: destination.id,
          currency_code: item.currencyCode,
          amount: item.amount,
        });
      }

      const created = await tx.fund_transfers.create({
        data: {
          transfer_no: `FT-${Date.now()}-${Math.floor(Math.random() * 1000)}`,
          source_branch_id: input.sourceBranchId,
          destination_branch_id: input.destinationBranchId,
          status: 'PENDING_APPROVAL',
          created_by_user_id: input.createdByUserId,
          fund_transfer_items: { create: resolvedItems },
        },
        include: { fund_transfer_items: true },
      });
      await this.notifications.notifyUsers({
        title: `Phiếu tiếp quỹ ${created.transfer_no} chờ xác nhận`,
        body: `Đã gửi ${created.fund_transfer_items.map((item) => `${Number(item.amount)} ${item.currency_code}`).join(', ')}`,
        sourceType: 'FUND_TRANSFER_CREATED',
        sourceId: created.id,
      }, {
        userIds: [input.createdByUserId],
        roles: ['ADMIN', 'MANAGER'],
        branchIds: [input.destinationBranchId],
      }, tx);
      return created;
    });
    return toTransfer(row);
  }

  async findTransferById(id: string): Promise<FundTransfer | null> {
    const row = await this.prisma.fund_transfers.findUnique({
      where: { id },
      include: { fund_transfer_items: true },
    });
    return row ? toTransfer(row) : null;
  }

  async listTransfers(filter?: ListTransfersFilter): Promise<FundTransfer[]> {
    const rows = await this.prisma.fund_transfers.findMany({
      where: {
        ...(filter?.status && { status: filter.status as any }),
        ...(filter?.branchId && {
          OR: [
            { source_branch_id: filter.branchId },
            { destination_branch_id: filter.branchId },
          ],
        }),
      },
      orderBy: { created_at: 'desc' },
      include: { fund_transfer_items: true },
    });
    return rows.map(toTransfer);
  }

  async confirmTransfer(id: string, confirmedByUserId: string): Promise<FundTransfer> {
    const now = new Date();

    const updated = await this.prisma.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT id FROM fund_transfers WHERE id = ${id}::uuid FOR UPDATE`;
      const t = await tx.fund_transfers.findUniqueOrThrow({
        where: { id },
        include: { fund_transfer_items: true },
      });
      if (t.status !== 'PENDING_APPROVAL') {
        throw new BadRequestException(`Chỉ xác nhận được phiếu đang chờ (hiện tại: ${t.status})`);
      }
      if (t.created_by_user_id === confirmedByUserId) {
        throw new BadRequestException('Người lập phiếu không được tự xác nhận phiếu tiếp quỹ');
      }

      const accountIds = [...new Set(t.fund_transfer_items.flatMap((item) => [
        item.source_account_id,
        item.destination_account_id,
      ]))].sort();
      for (const accountId of accountIds) {
        await this.lockFundAccount(tx, accountId);
      }

      const ledgerLines: Prisma.ledger_linesUncheckedCreateWithoutLedger_entriesInput[] = [];
      for (const item of t.fund_transfer_items) {
        const amount = Number(item.amount);
        const sourceBalance = await this.balance(tx, item.source_account_id);
        if (amount > sourceBalance) {
          throw new BadRequestException(
            `Số dư không đủ tại thời điểm xác nhận (còn ${sourceBalance} ${item.currency_code})`,
          );
        }
        const rate = await this.activeConversionRate(tx, item.currency_code as CurrencyCode);
        ledgerLines.push(
          {
            fund_account_id: item.source_account_id,
            direction: 'CREDIT',
            amount,
            currency_code: item.currency_code,
            exchange_rate: rate,
            base_amount_vnd: amount * rate,
          },
          {
            fund_account_id: item.destination_account_id,
            direction: 'DEBIT',
            amount,
            currency_code: item.currency_code,
            exchange_rate: rate,
            base_amount_vnd: amount * rate,
          },
        );
      }

      await tx.ledger_entries.create({
        data: {
          entry_no: `FT-${t.transfer_no}`,
          business_date: toVietnamBusinessDate(now),
          branch_id: t.source_branch_id,
          source_type: 'FUND_TRANSFER',
          source_id: t.id,
          status: 'POSTED',
          posted_at: now,
          description: `Tiếp quỹ ${t.fund_transfer_items.map((item) => `${Number(item.amount)} ${item.currency_code}`).join(', ')}`,
          created_by_user_id: confirmedByUserId,
          ledger_lines: { create: ledgerLines },
        },
      });
      const claimed = await tx.fund_transfers.updateMany({
        where: { id, status: 'PENDING_APPROVAL' },
        data: {
          status: 'CONFIRMED',
          confirmed_by_user_id: confirmedByUserId,
          confirmed_at: now,
          posted_at: now,
        },
      });
      if (claimed.count !== 1) {
        throw new BadRequestException('Phiếu tiếp quỹ đã được xử lý bởi người khác');
      }
      await this.notifications.notifyUsers({
        title: `Phiếu tiếp quỹ ${t.transfer_no} đã được xác nhận`,
        body: `Số dư quỹ nguồn đã giảm và quỹ nhận đã tăng: ${t.fund_transfer_items.map((item) => `${Number(item.amount)} ${item.currency_code}`).join(', ')}`,
        sourceType: 'FUND_TRANSFER_CONFIRMED',
        sourceId: t.id,
      }, {
        userIds: [t.created_by_user_id, confirmedByUserId],
        roles: ['ADMIN', 'MANAGER'],
        branchIds: [t.source_branch_id, t.destination_branch_id],
      }, tx);
      return tx.fund_transfers.findUniqueOrThrow({
        where: { id },
        include: { fund_transfer_items: true },
      });
    });
    return toTransfer(updated);
  }

  async rejectTransfer(id: string, userId: string): Promise<FundTransfer> {
    const row = await this.prisma.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT id FROM fund_transfers WHERE id = ${id}::uuid FOR UPDATE`;
      const t = await tx.fund_transfers.findUniqueOrThrow({
        where: { id },
        include: { fund_transfer_items: true },
      });
      if (t.status !== 'PENDING_APPROVAL') {
        throw new BadRequestException(`Chỉ từ chối được phiếu đang chờ (hiện tại: ${t.status})`);
      }
      if (t.created_by_user_id === userId) {
        throw new BadRequestException('Người lập phiếu không được tự từ chối phiếu tiếp quỹ');
      }
      const claimed = await tx.fund_transfers.updateMany({
        where: { id, status: 'PENDING_APPROVAL' },
        data: { status: 'REJECTED', confirmed_by_user_id: userId, confirmed_at: new Date() },
      });
      if (claimed.count !== 1) throw new BadRequestException('Phiếu tiếp quỹ đã được xử lý bởi người khác');
      await this.notifications.notifyUsers({
        title: `Phiếu tiếp quỹ ${t.transfer_no} đã bị từ chối`,
        body: t.fund_transfer_items.map((item) => `${Number(item.amount)} ${item.currency_code}`).join(', '),
        sourceType: 'FUND_TRANSFER_REJECTED',
        sourceId: t.id,
      }, {
        userIds: [t.created_by_user_id, userId],
        roles: ['ADMIN', 'MANAGER'],
        branchIds: [t.source_branch_id, t.destination_branch_id],
      }, tx);
      return tx.fund_transfers.findUniqueOrThrow({ where: { id }, include: { fund_transfer_items: true } });
    });
    return toTransfer(row);
  }

  async cancelTransfer(id: string, createdByUserId: string): Promise<FundTransfer> {
    const row = await this.prisma.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT id FROM fund_transfers WHERE id = ${id}::uuid FOR UPDATE`;
      const transfer = await tx.fund_transfers.findUniqueOrThrow({
        where: { id },
        include: { fund_transfer_items: true },
      });
      if (transfer.created_by_user_id !== createdByUserId) {
        throw new BadRequestException('Chỉ người lập phiếu mới được hủy phiếu tiếp quỹ');
      }
      if (transfer.status !== 'PENDING_APPROVAL') {
        throw new BadRequestException(`Chỉ hủy được phiếu chưa xác nhận (hiện tại: ${transfer.status})`);
      }

      const claimed = await tx.fund_transfers.updateMany({
        where: { id, status: 'PENDING_APPROVAL', created_by_user_id: createdByUserId },
        data: { status: 'CANCELLED' },
      });
      if (claimed.count !== 1) {
        throw new BadRequestException('Phiếu tiếp quỹ đã được xử lý bởi người khác');
      }

      await this.notifications.notifyUsers({
        title: `Phiếu tiếp quỹ ${transfer.transfer_no} đã được hủy`,
        body: transfer.fund_transfer_items.map((item) => `${Number(item.amount)} ${item.currency_code}`).join(', '),
        sourceType: 'FUND_TRANSFER_CANCELLED',
        sourceId: transfer.id,
      }, {
        userIds: [createdByUserId],
        roles: ['ADMIN', 'MANAGER'],
        branchIds: [transfer.destination_branch_id],
      }, tx);

      return tx.fund_transfers.findUniqueOrThrow({
        where: { id },
        include: { fund_transfer_items: true },
      });
    });
    return toTransfer(row);
  }

  private async lockFundAccount(db: any, fundAccountId: string) {
    await db.$queryRaw`SELECT id FROM fund_accounts WHERE id = ${fundAccountId}::uuid FOR UPDATE`;
  }

  private async lockBankAccount(db: any, bankAccountId: string) {
    await db.$queryRaw`SELECT id FROM bank_accounts WHERE id = ${bankAccountId}::uuid FOR UPDATE`;
  }

  private async balance(db: any, fundAccountId: string): Promise<number> {
    const lines = await db.ledger_lines.findMany({
      where: { fund_account_id: fundAccountId, ledger_entries: { status: 'POSTED' } },
      select: { direction: true, amount: true },
    });
    return lines.reduce((sum: number, line: any) => sum + (line.direction === 'DEBIT' ? Number(line.amount) : -Number(line.amount)), 0);
  }

  private async activeConversionRate(db: any, currency: CurrencyCode): Promise<number> {
    if (currency === 'VND') return 1;
    const fxRate = await db.exchange_rates.findFirst({
      where: {
        status: 'ACTIVE',
        rate_type: 'FX_BUY',
        provider: 'INTERNAL',
        from_currency: currency,
        to_currency: 'VND',
        effective_from: { lte: new Date() },
        OR: [{ effective_to: null }, { effective_to: { gt: new Date() } }],
      },
      orderBy: { effective_from: 'desc' },
      select: { rate: true },
    });
    if (fxRate) return Number(fxRate.rate);

    if (currency === 'USD') {
      const paidRate = await db.exchange_rates.findFirst({
        where: {
          status: 'ACTIVE',
          rate_type: { in: ['PAID_BUY', 'BANK_RATE'] },
          from_currency: 'USD',
          to_currency: 'VND',
        },
        orderBy: { effective_from: 'desc' },
        select: { rate: true },
      });
      if (paidRate) return Number(paidRate.rate);
    }

    throw new BadRequestException(`Chưa có tỷ giá quy đổi ACTIVE cho ${currency}/VND`);
  }

  // ── helper: tính số dư nhiều account từ ledger_lines POSTED ──
  private async balancesFor(accountIds: string[]): Promise<Map<string, number>> {
    const map = new Map<string, number>();
    if (accountIds.length === 0) return map;
    const lines = await this.prisma.ledger_lines.findMany({
      where: { fund_account_id: { in: accountIds }, ledger_entries: { status: 'POSTED' } },
      select: { fund_account_id: true, direction: true, amount: true },
    });
    for (const l of lines) {
      const cur = map.get(l.fund_account_id) ?? 0;
      const amt = Number(l.amount);
      map.set(l.fund_account_id, cur + (l.direction === 'DEBIT' ? amt : -amt));
    }
    return map;
  }
}

function fundVoucherNo(movementNo: string) {
  return /^(PT|PC)-/.test(movementNo) ? movementNo.replace(/-\d{2}$/, '') : movementNo;
}

function toTransfer(row: any): FundTransfer {
  return {
    id: row.id,
    transferNo: row.transfer_no,
    sourceBranchId: row.source_branch_id,
    destinationBranchId: row.destination_branch_id,
    items: (row.fund_transfer_items ?? []).map((item: any) => ({
      id: item.id,
      sourceAccountId: item.source_account_id,
      destinationAccountId: item.destination_account_id,
      currencyCode: item.currency_code as CurrencyCode,
      amount: Number(item.amount),
    })),
    status: row.status as FundTransferStatus,
    createdByUserId: row.created_by_user_id,
    confirmedByUserId: row.confirmed_by_user_id ?? null,
    createdAt: row.created_at,
    confirmedAt: row.confirmed_at ?? null,
  };
}
