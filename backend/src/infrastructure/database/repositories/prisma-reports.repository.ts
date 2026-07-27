// Prisma Reports Repository — tổng hợp GD WU/MG/FX
// Layer: Infrastructure

import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma.service';
import { IReportsRepository, TxStats, ProviderStat } from '../../../domain/repositories/reports.repository';

@Injectable()
export class PrismaReportsRepository implements IReportsRepository {
  constructor(private readonly prisma: PrismaService) {}

  async txStats(): Promise<TxStats> {
    return {
      wu: await this.providerStat('WU'),
      mg: await this.providerStat('MG'),
      fx: await this.fxStat(),
    };
  }

  private async providerStat(provider: 'WU' | 'MG'): Promise<ProviderStat> {
    const rows = await this.prisma.customer_transactions.findMany({
      where: { operation_code: provider, status: 'COMPLETED' },
      include: provider === 'WU'
        ? { wu_transaction_details: true }
        : { mg_transaction_details: true },
    });
    let totalUsd = 0, totalVnd = 0, profit = 0;
    for (const r of rows as any[]) {
      const usd = Number(r.amount);
      totalUsd += usd;
      totalVnd += Number(r.vnd_amount);
      const d = provider === 'WU' ? r.wu_transaction_details : r.mg_transaction_details;
      if (d) {
        const impliedRate = provider === 'WU' ? Number(d.wu_rate) : (usd > 0 ? Number(r.vnd_amount) / usd : 0);
        profit += (impliedRate - Number(d.applied_rate)) * usd;
      }
    }
    return { count: rows.length, totalUsd, totalVnd, profit };
  }

  private async fxStat() {
    const rows = await this.prisma.customer_transactions.findMany({
      where: { operation_code: 'FX', status: 'COMPLETED' },
      include: { fx_transaction_details: true },
    });
    let buyCount = 0, sellCount = 0, buyVnd = 0, sellVnd = 0;
    for (const r of rows as any[]) {
      const vnd = Number(r.vnd_amount);
      if (r.fx_transaction_details?.is_buy) { buyCount++; buyVnd += vnd; }
      else { sellCount++; sellVnd += vnd; }
    }
    return { buyCount, sellCount, buyVnd, sellVnd };
  }
}
