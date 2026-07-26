// Prisma Debt Repository Implementation
// Layer: Infrastructure

import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma.service';
import {
  IDebtRepository, RecordDebtInput, SettleDebtInput, ListDebtsFilter,
} from '../../../domain/repositories/debt.repository';
import {
  DebtAccount, DebtAccountSummary, DebtMovement, DebtMovementType,
  CurrencyCode, computeDebtStatus,
} from '../../../domain/entities/debt.entity';

// movement_type nào là "tăng nợ"
const INCREASE_TYPES = ['EXPECTED_DEBT', 'ACTUAL_DEBT'];

@Injectable()
export class PrismaDebtRepository implements IDebtRepository {
  constructor(private readonly prisma: PrismaService) {}

  async recordDebt(input: RecordDebtInput): Promise<DebtMovement> {
    const account = await this.ensureAccount(
      input.branchId, input.providerCode, input.currencyCode,
    );
    const now = new Date();
    const row = await this.prisma.debt_movements.create({
      data: {
        debt_account_id: account.id,
        branch_id: input.branchId,
        movement_type: 'EXPECTED_DEBT',
        source_type: (input.sourceType as any) ?? null,
        source_id: input.sourceId ?? null,
        business_date: input.businessDate ?? now,
        amount: input.amount,
        currency_code: input.currencyCode,
        description: input.description ?? null,
        status: 'POSTED',
        posted_at: now,
        created_by_user_id: input.createdByUserId,
      },
    });
    return toMovement(row);
  }

  async settle(input: SettleDebtInput): Promise<DebtMovement> {
    const account = await this.prisma.debt_accounts.findUniqueOrThrow({
      where: { id: input.debtAccountId },
    });
    const now = new Date();
    const row = await this.prisma.debt_movements.create({
      data: {
        debt_account_id: account.id,
        branch_id: account.branch_id,
        movement_type: 'SETTLEMENT',
        business_date: input.businessDate ?? now,
        amount: input.amount,
        currency_code: account.currency_code,
        description: input.description ?? null,
        status: 'POSTED',
        posted_at: now,
        created_by_user_id: input.createdByUserId,
      },
    });
    return toMovement(row);
  }

  async findAccountById(id: string): Promise<DebtAccount | null> {
    const row = await this.prisma.debt_accounts.findUnique({ where: { id } });
    return row ? toAccount(row) : null;
  }

  async getAccountSummary(id: string): Promise<DebtAccountSummary | null> {
    const acc = await this.prisma.debt_accounts.findUnique({ where: { id } });
    if (!acc) return null;
    return this.buildSummary(acc);
  }

  async listAccountSummaries(filter?: ListDebtsFilter): Promise<DebtAccountSummary[]> {
    const accounts = await this.prisma.debt_accounts.findMany({
      where: {
        ...(filter?.branchId && { branch_id: filter.branchId }),
        ...(filter?.providerCode && { provider_code: filter.providerCode }),
        ...(filter?.currencyCode && { currency_code: filter.currencyCode }),
      },
      orderBy: { created_at: 'desc' },
    });
    return Promise.all(accounts.map((a) => this.buildSummary(a)));
  }

  async listMovements(accountId: string): Promise<DebtMovement[]> {
    const rows = await this.prisma.debt_movements.findMany({
      where: { debt_account_id: accountId },
      orderBy: { effective_at: 'desc' },
    });
    return rows.map(toMovement);
  }

  // ── helpers ──────────────────────────────────────────────

  private async ensureAccount(
    branchId: string, providerCode: string, currencyCode: CurrencyCode,
  ) {
    const existing = await this.prisma.debt_accounts.findUnique({
      where: {
        branch_id_provider_code_currency_code: {
          branch_id: branchId, provider_code: providerCode, currency_code: currencyCode,
        },
      },
    });
    if (existing) return existing;
    return this.prisma.debt_accounts.create({
      data: {
        branch_id: branchId,
        provider_code: providerCode,
        currency_code: currencyCode,
        name: `Công nợ ${providerCode} ${currencyCode}`,
      },
    });
  }

  private async buildSummary(acc: any): Promise<DebtAccountSummary> {
    const grouped = await this.prisma.debt_movements.groupBy({
      by: ['movement_type'],
      where: { debt_account_id: acc.id, status: 'POSTED' },
      _sum: { amount: true },
    });
    let totalDebt = 0;
    let totalSettled = 0;
    for (const g of grouped) {
      const sum = Number(g._sum.amount ?? 0);
      if (INCREASE_TYPES.includes(g.movement_type)) totalDebt += sum;
      else if (g.movement_type === 'SETTLEMENT') totalSettled += sum;
    }
    const outstanding = totalDebt - totalSettled;
    return {
      ...toAccount(acc),
      totalDebt,
      totalSettled,
      outstanding,
      status: computeDebtStatus(totalDebt, totalSettled),
    };
  }
}

function toAccount(row: any): DebtAccount {
  return {
    id: row.id,
    branchId: row.branch_id,
    providerCode: row.provider_code,
    currencyCode: row.currency_code as CurrencyCode,
    name: row.name,
  };
}

function toMovement(row: any): DebtMovement {
  return {
    id: row.id,
    debtAccountId: row.debt_account_id,
    branchId: row.branch_id,
    movementType: row.movement_type as DebtMovementType,
    sourceType: row.source_type ?? null,
    sourceId: row.source_id ?? null,
    businessDate: row.business_date,
    effectiveAt: row.effective_at,
    amount: Number(row.amount),
    currencyCode: row.currency_code as CurrencyCode,
    description: row.description ?? null,
    createdByUserId: row.created_by_user_id,
    createdAt: row.created_at,
  };
}
