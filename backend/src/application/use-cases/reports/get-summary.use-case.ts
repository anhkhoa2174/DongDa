// Use Case: Báo cáo tổng hợp / Dashboard summary
// Layer: Application — tái sử dụng các repo đã có (reports + debt + fund + bank)

import { BadRequestException, Injectable, Inject } from '@nestjs/common';
import { IReportsRepository } from '../../../domain/repositories/reports.repository';
import { IDebtRepository } from '../../../domain/repositories/debt.repository';
import { IFundRepository } from '../../../domain/repositories/fund.repository';
import { IBankRepository } from '../../../domain/repositories/bank.repository';

@Injectable()
export class GetSummaryUseCase {
  constructor(
    @Inject('IReportsRepository') private readonly reports: IReportsRepository,
    @Inject('IDebtRepository') private readonly debt: IDebtRepository,
    @Inject('IFundRepository') private readonly fund: IFundRepository,
    @Inject('IBankRepository') private readonly bank: IBankRepository,
  ) {}

  async execute(filter?: { branchId?: string; dateFrom?: Date; dateToExclusive?: Date }) {
    const [transactions, debts, funds, bankAccounts] = await Promise.all([
      this.reports.txStats(filter),
      this.debt.listAccountSummaries({
        branchId: filter?.branchId,
        dateFrom: filter?.dateFrom,
        dateTo: filter?.dateToExclusive,
      }),
      this.fund.listBalances(filter?.branchId),
      this.bank.listAccounts(),
    ]);
    const scopedBankAccounts = filter?.branchId
      ? bankAccounts.filter((account) => account.branchId === filter.branchId)
      : bankAccounts;

    const sum = (arr: any[], pred: (x: any) => boolean, pick: (x: any) => number) =>
      arr.filter(pred).reduce((s, x) => s + pick(x), 0);

    return {
      transactions,
      // Quỹ
      cash: {
        vnd: sum(funds, (f) => f.accountType === 'CASH' && f.currencyCode === 'VND', (f) => f.balance),
        usd: sum(funds, (f) => f.accountType === 'CASH' && f.currencyCode === 'USD', (f) => f.balance),
      },
      fundA: funds.filter((f) => f.accountType === 'FUND_A').map((f) => ({ currency: f.currencyCode, balance: f.balance })),
      // Ngân hàng
      bank: {
        accounts: scopedBankAccounts.map((b) => ({ bankCode: b.bankCode, currency: b.currencyCode, balance: b.currentBalance })),
        totalVnd: sum(scopedBankAccounts, (b) => b.currencyCode === 'VND', (b) => b.currentBalance),
        totalUsd: sum(scopedBankAccounts, (b) => b.currencyCode === 'USD', (b) => b.currentBalance),
      },
      // Công nợ
      debt: {
        items: debts.map((d) => ({ provider: d.providerCode, currency: d.currencyCode, outstanding: d.outstanding, status: d.status })),
        wuOutstandingUsd: sum(debts, (d) => d.providerCode === 'WU' && d.currencyCode === 'USD', (d) => d.outstanding),
        mgOutstandingUsd: sum(debts, (d) => d.providerCode === 'MG' && d.currencyCode === 'USD', (d) => d.outstanding),
      },
      // Cảnh báo
      alerts: [
        ...debts.filter((d) => d.outstanding > 0).map((d) => ({
          type: 'DEBT', level: 'warning',
          message: `Công nợ ${d.providerCode} ${d.currencyCode} còn ${d.outstanding.toLocaleString('vi-VN')}`,
        })),
        ...funds.filter((f) => f.accountType === 'CASH' && f.balance < 0).map((f) => ({
          type: 'FUND', level: 'error', message: `Quỹ ${f.code} âm: ${f.balance}`,
        })),
      ],
    };
  }

  dashboardOperations(date?: string) {
    return this.reports.dashboardOperations(this.dashboardDate(date));
  }

  companyDashboard(date?: string) {
    return this.reports.companyDashboard(this.dashboardDate(date));
  }

  private dashboardDate(date?: string) {
    const currentDate = new Intl.DateTimeFormat('en-CA', {
      timeZone: 'Asia/Ho_Chi_Minh',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    }).format(new Date());
    const requestedDate = date ?? currentDate;
    if (!/^\d{4}-\d{2}-\d{2}$/.test(requestedDate)) {
      throw new BadRequestException('date phải có định dạng YYYY-MM-DD');
    }
    const businessDate = new Date(`${requestedDate}T00:00:00.000Z`);
    if (Number.isNaN(businessDate.getTime())) throw new BadRequestException('Ngày dashboard không hợp lệ');
    return businessDate;
  }
}
