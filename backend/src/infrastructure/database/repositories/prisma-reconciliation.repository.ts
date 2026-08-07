// Prisma Reconciliation Repository
// Layer: Infrastructure

import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma.service';
import {
  IReconciliationRepository, SaveRunInput, ReconRunSummary,
} from '../../../domain/repositories/reconciliation.repository';
import { SystemTxn, ReconItem, ReconItemStatus } from '../../../domain/entities/reconciliation.entity';
import { NotificationService } from '../../notifications/notification.service';

@Injectable()
export class PrismaReconciliationRepository implements IReconciliationRepository {
  constructor(
    private readonly prisma: PrismaService,
    private readonly notifications: NotificationService,
  ) {}

  async listSystemTxByProvider(provider: string, businessDate: Date, branchId?: string): Promise<SystemTxn[]> {
    const rows = await this.prisma.customer_transactions.findMany({
      where: {
        operation_code: provider as any,
        status: 'COMPLETED',
        business_date: businessDate,
        ...(branchId ? { branch_id: branchId } : {}),
      },
      include: { wu_transaction_details: true, mg_transaction_details: true },
    });
    const out: SystemTxn[] = [];
    for (const r of rows) {
      const code = provider === 'WU'
        ? r.wu_transaction_details?.mtcn
        : r.mg_transaction_details?.reference_no;
      if (!code) continue;
      out.push({
        code,
        transactionId: r.id,
        branchId: r.branch_id,
        amount: provider === 'WU'
          ? (r.wu_transaction_details!.paid_currency === 'VND' ? Number(r.wu_transaction_details!.wu_vnd_amount) : Number(r.wu_transaction_details!.wu_usd_amount))
          : (r.mg_transaction_details!.paid_currency === 'VND' ? Number(r.vnd_amount) : Number(r.amount)),
        currencyCode: provider === 'WU'
          ? r.wu_transaction_details!.paid_currency as 'USD' | 'VND'
          : r.mg_transaction_details!.paid_currency as 'USD' | 'VND',
        customerName: r.customer_name ?? null,
      });
    }
    return out;
  }

  async saveRun(input: SaveRunInput): Promise<ReconRunSummary> {
    const { result } = input;
    const now = new Date();
    const status = result.matchRate >= 1 ? 'MATCHED' : 'PENDING_REVIEW';
    const rnd = `${Date.now()}-${Math.floor(Math.random() * 100000)}`;

    // Các dòng có mặt trong Journal (khớp / lệch / thiếu-hệ-thống)
    const journalItems = result.items.filter((i) => i.status !== 'MISSING_IN_JOURNAL');

    const run = await this.prisma.$transaction(async (tx) => {
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`${input.provider}:${input.scope}:${input.branchId ?? 'ALL'}:${input.businessDate.toISOString().slice(0, 10)}:${input.currencyCode}`}))`;
      const posted = await tx.reconciliation_runs.findFirst({
        where: {
          provider: input.provider as any,
          scope: input.scope,
          branch_id: input.branchId ?? null,
          business_date: input.businessDate,
          currency_code: input.currencyCode,
          posted_at: { not: null },
        },
      });
      if (posted) throw new Error('Journal ngày/phạm vi này đã được đối chiếu và ghi công nợ thực tế');

      // Chuỗi file → batch → rows (thỏa check constraint nguồn của item)
      const file = await tx.journal_upload_files.create({
        data: {
          provider: input.provider as any, scope: input.scope, branch_id: input.branchId ?? null, business_date: input.businessDate,
          original_file_name: `journal-${input.provider}.json`, storage_key: `inline/${rnd}`,
          file_hash: rnd, uploaded_by_user_id: input.createdByUserId,
        },
      });
      const batch = await tx.journal_batches.create({
        data: {
          journal_file_id: file.id, provider: input.provider as any, scope: input.scope, branch_id: input.branchId ?? null,
          business_date: input.businessDate, batch_no: `JB-${rnd}`, status: 'PARSED',
          row_count: journalItems.length, total_amount: result.journalTotal, currency_code: input.currencyCode,
          parsed_at: now,
        },
      });
      // Tạo journal_rows, map code → rowId
      const codeToRow = new Map<string, string>();
      let rowNo = 1;
      for (const it of journalItems) {
        const jr = await tx.journal_rows.create({
          data: {
            journal_batch_id: batch.id, row_no: rowNo++, external_reference: it.code,
            matched_branch_id: it.branchId ?? null,
            amount: it.journalAmount, currency_code: it.currencyCode, match_status: it.status as any,
            matched_transaction_id: it.transactionId ?? null,
          },
        });
        codeToRow.set(it.code, jr.id);
      }

      const createdRun = await tx.reconciliation_runs.create({
        data: {
          run_no: `RC-${rnd}`, provider: input.provider as any, scope: input.scope, branch_id: input.branchId ?? null,
          business_date: input.businessDate, status,
          currency_code: input.currencyCode,
          system_total_amount: result.systemTotal, journal_total_amount: result.journalTotal,
          variance_amount: result.varianceTotal, created_by_user_id: input.createdByUserId, posted_at: now,
          reconciliation_items: {
            create: result.items.map((it) => ({
              journal_row_id: it.status !== 'MISSING_IN_JOURNAL' ? (codeToRow.get(it.code) ?? null) : null,
              transaction_id: it.transactionId ?? null,
              branch_id: it.branchId ?? null,
              system_amount: it.systemAmount, journal_amount: it.journalAmount, variance_amount: it.varianceAmount,
              currency_code: it.currencyCode,
              status: it.status as any,
              note: `${it.code} · ${it.note ?? ''}`.trim(),
            })),
          },
        },
      });

      await this.postActualDebt(tx, createdRun.id, input, result.items, now);
      const discrepancies = result.items.filter((item) => item.status !== ReconItemStatus.MATCHED);
      if (discrepancies.length > 0) {
        const statusCounts = discrepancies.reduce<Record<string, number>>((counts, item) => {
          counts[item.status] = (counts[item.status] ?? 0) + 1;
          return counts;
        }, {});
        const statusLabel: Record<string, string> = {
          [ReconItemStatus.AMOUNT_VARIANCE]: 'lệch số tiền',
          [ReconItemStatus.MISSING_IN_SYSTEM]: 'thiếu trên hệ thống',
          [ReconItemStatus.MISSING_IN_JOURNAL]: 'thiếu trong Journal',
        };
        const details = Object.entries(statusCounts)
          .map(([itemStatus, count]) => `${count} ${statusLabel[itemStatus] ?? itemStatus}`)
          .join(', ');
        const affectedBranchIds = [...new Set([
          ...(input.branchId ? [input.branchId] : []),
          ...discrepancies.map((item) => item.branchId).filter((id): id is string => Boolean(id)),
        ])];
        await this.notifications.notifyUsers({
          title: `Cảnh báo sai lệch đối chiếu ${input.provider}`,
          body: `Ngày ${input.businessDate.toISOString().slice(0, 10)}: ${discrepancies.length}/${result.totalCount} dòng cần xử lý (${details}); chênh lệch tổng ${result.varianceTotal.toLocaleString('vi-VN')} ${input.currencyCode}.`,
          sourceType: 'RECONCILIATION_VARIANCE',
          sourceId: createdRun.id,
        }, {
          userIds: [input.createdByUserId],
          roles: ['ADMIN', 'MANAGER'],
          branchIds: affectedBranchIds,
        }, tx);
      }
      return createdRun;
    });

    return this.toSummary(run, result.matchedCount, result.totalCount, result.matchRate);
  }

  async listRuns(): Promise<ReconRunSummary[]> {
    const runs = await this.prisma.reconciliation_runs.findMany({
      orderBy: { created_at: 'desc' },
      take: 50,
    });
    const out: ReconRunSummary[] = [];
    for (const run of runs) {
      const grouped = await this.prisma.reconciliation_items.groupBy({
        by: ['status'],
        where: { reconciliation_run_id: run.id },
        _count: { _all: true },
      });
      const total = grouped.reduce((s, g) => s + g._count._all, 0);
      const matched = grouped.find((g) => g.status === 'MATCHED')?._count._all ?? 0;
      out.push(this.toSummary(run, matched, total, total > 0 ? matched / total : 1));
    }
    return out;
  }

  async getItems(runId: string): Promise<ReconItem[]> {
    const rows = await this.prisma.reconciliation_items.findMany({
      where: { reconciliation_run_id: runId },
      include: { journal_rows: { select: { currency_code: true } } },
      orderBy: { status: 'asc' },
    });
    return rows.map((r: any) => {
      const [code, ...rest] = (r.note ?? '').split(' · ');
      return {
        status: r.status as ReconItemStatus,
        code: code ?? '',
        transactionId: r.transaction_id ?? null,
        branchId: r.branch_id ?? null,
        systemAmount: Number(r.system_amount),
        journalAmount: Number(r.journal_amount),
        varianceAmount: Number(r.variance_amount),
        currencyCode: r.currency_code as 'USD' | 'VND',
        note: rest.join(' · ') || undefined,
      };
    });
  }

  private toSummary(run: any, matchedCount: number, totalCount: number, matchRate: number): ReconRunSummary {
    return {
      id: run.id,
      runNo: run.run_no,
      provider: run.provider,
      currencyCode: run.currency_code,
      businessDate: run.business_date,
      status: run.status,
      systemTotal: Number(run.system_total_amount),
      journalTotal: Number(run.journal_total_amount),
      varianceTotal: Number(run.variance_amount),
      matchRate,
      matchedCount,
      totalCount,
      createdAt: run.created_at,
    };
  }

  private async postActualDebt(tx: any, runId: string, input: SaveRunInput, items: ReconItem[], now: Date) {
    const accounts = await tx.debt_accounts.findMany({
      where: {
        provider_code: input.provider,
        business_date: input.businessDate,
        currency_code: input.currencyCode,
        ...(input.branchId ? { branch_id: input.branchId } : {}),
      },
      include: { debt_movements: { where: { status: 'POSTED' } } },
    });
    if (accounts.some((account: any) => account.debt_movements.some((m: any) => m.movement_type === 'SETTLEMENT'))) {
      throw new Error('Không thể chốt Journal sau khi công nợ ngày này đã được thanh toán');
    }

    for (const account of accounts) {
      const expectedMovements = account.debt_movements
        .filter((movement: any) => movement.movement_type === 'EXPECTED_DEBT');
      for (const expected of expectedMovements) {
        await tx.debt_movements.create({ data: {
          debt_account_id: account.id, branch_id: account.branch_id, movement_type: 'REVERSAL',
          source_type: 'DEBT_MOVEMENT', source_id: expected.id,
          business_date: input.businessDate, amount: expected.amount, currency_code: account.currency_code,
          status: 'POSTED', posted_at: now,
          description: `Đảo công nợ dự kiến khi chốt Journal ${runId}`,
          created_by_user_id: input.createdByUserId,
        }});
      }
    }

    const actual = new Map<string, { branchId: string; currencyCode: 'USD' | 'VND'; amount: number }>();
    for (const item of items) {
      if (!item.branchId || item.journalAmount <= 0) continue;
      const key = `${item.branchId}:${item.currencyCode}`;
      const current = actual.get(key) ?? { branchId: item.branchId, currencyCode: item.currencyCode, amount: 0 };
      current.amount += item.journalAmount;
      actual.set(key, current);
    }
    for (const value of actual.values()) {
      const account = await tx.debt_accounts.upsert({
        where: { branch_id_provider_code_currency_code_business_date: {
          branch_id: value.branchId, provider_code: input.provider,
          currency_code: value.currencyCode, business_date: input.businessDate,
        }},
        update: {},
        create: {
          branch_id: value.branchId, provider_code: input.provider, currency_code: value.currencyCode,
          business_date: input.businessDate,
          name: `Công nợ ${input.provider} ${value.currencyCode} ngày ${input.businessDate.toISOString().slice(0, 10)}`,
        },
      });
      await tx.debt_movements.create({ data: {
        debt_account_id: account.id, branch_id: value.branchId, movement_type: 'ACTUAL_DEBT',
        source_type: 'JOURNAL_RECONCILIATION', source_id: runId,
        business_date: input.businessDate, amount: value.amount, currency_code: value.currencyCode,
        status: 'POSTED', posted_at: now, description: 'Công nợ thực tế theo Journal cuối ngày',
        created_by_user_id: input.createdByUserId,
      }});
    }
  }
}
