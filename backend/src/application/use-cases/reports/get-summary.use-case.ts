// Use Case: Báo cáo tổng hợp / Dashboard summary
// Layer: Application — tái sử dụng các repo đã có (reports + debt + fund + bank)

import { Injectable, Inject } from '@nestjs/common';
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

  async execute() {
    const [transactions, debts, funds, bankAccounts] = await Promise.all([
      this.reports.txStats(),
      this.debt.listAccountSummaries(),
      this.fund.listBalances(),
      this.bank.listAccounts(),
    ]);

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
        accounts: bankAccounts.map((b) => ({ bankCode: b.bankCode, currency: b.currencyCode, balance: b.currentBalance })),
        totalVnd: sum(bankAccounts, (b) => b.currencyCode === 'VND', (b) => b.currentBalance),
        totalUsd: sum(bankAccounts, (b) => b.currencyCode === 'USD', (b) => b.currentBalance),
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
}
