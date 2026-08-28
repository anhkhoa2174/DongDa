// Prisma Reconciliation Repository
// Layer: Infrastructure

import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma.service';
import {
  IReconciliationRepository, SaveRunInput, ReconRunSummary,
} from '../../../domain/repositories/reconciliation.repository';
import { SystemTxn, ReconItem, ReconItemStatus, FundReconItem } from '../../../domain/entities/reconciliation.entity';
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

  // F9.1 — Đối chiếu quỹ: tồn hệ thống (ledger) vs tồn thực tế (kiểm quỹ gần nhất).
  async fundReconciliation(branchId?: string): Promise<FundReconItem[]> {
    const [accounts, branches, counts] = await Promise.all([
      this.prisma.fund_accounts.findMany({
        where: { status: 'ACTIVE', account_type: { in: ['CASH', 'FUND_A'] }, ...(branchId ? { branch_id: branchId } : {}) },
        select: { id: true, branch_id: true, currency_code: true },
      }),
      this.prisma.branch.findMany({ select: { id: true, code: true } }),
      this.prisma.cash_counts.findMany({
        where: { ...(branchId ? { branch_id: branchId } : {}) },
        orderBy: { counted_at: 'desc' },
        include: { cash_count_lines: { select: { currency_code: true, actual_amount: true } } },
      }),
    ]);
    const branchCode = new Map(branches.map((b) => [b.id, b.code]));

    // Tồn hệ thống: cộng số dư ledger của mọi sổ cùng (chi nhánh, loại tiền).
    const system = new Map<string, { branchId: string; currencyCode: string; balance: number }>();
    for (const acc of accounts) {
      const bal = await this.balanceOf(acc.id);
      const key = `${acc.branch_id}::${acc.currency_code}`;
      const cur = system.get(key);
      system.set(key, { branchId: acc.branch_id, currencyCode: String(acc.currency_code), balance: (cur?.balance ?? 0) + bal });
    }

    // Tồn thực tế: lần kiểm quỹ gần nhất cho mỗi (chi nhánh, loại tiền).
    const physical = new Map<string, { actual: number; countedAt: Date }>();
    for (const count of counts) {
      for (const line of count.cash_count_lines) {
        const key = `${count.branch_id}::${line.currency_code}`;
        if (!physical.has(key)) physical.set(key, { actual: Number(line.actual_amount), countedAt: count.counted_at });
      }
    }

    const items: FundReconItem[] = [];
    for (const [key, sys] of system) {
      const phys = physical.get(key);
      const physicalActual = phys ? phys.actual : null;
      const variance = phys ? phys.actual - sys.balance : 0;
      let status: FundReconItem['status'];
      if (!phys) status = 'NO_COUNT';
      else if (Math.abs(variance) < 0.01) status = 'MATCH';
      else status = variance > 0 ? 'OVERAGE' : 'SHORTAGE';
      items.push({
        branchId: sys.branchId,
        branchCode: branchCode.get(sys.branchId) ?? sys.branchId.slice(0, 8),
        currencyCode: sys.currencyCode,
        systemBalance: sys.balance,
        physicalActual,
        variance,
        status,
        countedAt: phys ? phys.countedAt : null,
      });
    }
    // Ưu tiên hiện các dòng có lệch trước, rồi theo chi nhánh + loại tiền.
    const rank = { SHORTAGE: 0, OVERAGE: 1, NO_COUNT: 2, MATCH: 3 } as const;
    return items.sort((a, b) =>
      rank[a.status] - rank[b.status]
      || a.branchCode.localeCompare(b.branchCode)
      || a.currencyCode.localeCompare(b.currencyCode));
  }

  private async balanceOf(fundAccountId: string): Promise<number> {
    const lines = await this.prisma.ledger_lines.findMany({
      where: { fund_account_id: fundAccountId, ledger_entries: { status: 'POSTED' } },
      select: { direction: true, amount: true },
    });
    return lines.reduce((s, l) => s + (l.direction === 'DEBIT' ? Number(l.amount) : -Number(l.amount)), 0);
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

  // ─── PENDING JOURNAL (STAFF upload → KTTH duyệt) ────────────────────────────
  // Dùng bảng reconciliation_runs với status=PENDING_REVIEW (không cần migrate DB).
  // Rows đã parse được lưu vào reconciliation_items với status=JOURNAL_ONLY.

  async savePendingJournal(
    input: import('../../../domain/repositories/reconciliation.repository').SavePendingJournalInput,
  ): Promise<import('../../../domain/repositories/reconciliation.repository').PendingJournalSummary> {
    const runNo = `PEND-${input.provider}-${Date.now()}`;
    const journalTotal = input.rows.reduce((s, r) => s + r.amount, 0);
    const run = await this.prisma.reconciliation_runs.create({
      data: {
        run_no: runNo,
        provider: input.provider as any,
        business_date: input.businessDate,
        scope: input.provider === 'WU' ? 'BRANCH' : 'COMPANY',
        branch_id: input.branchId ?? null,
        currency_code: 'USD',
        status: 'PENDING_REVIEW',
        system_total_amount: 0,
        journal_total_amount: journalTotal,
        variance_amount: 0,
        created_by_user_id: input.createdByUserId,
        // Lưu rows đã parse thành reconciliation_items (JOURNAL_ONLY)
        reconciliation_items: {
          create: input.rows.map((row) => ({
            status: 'JOURNAL_ONLY',
            code: row.code,
            currency_code: row.currencyCode as any,
            branch_id: row.branchId ?? input.branchId ?? null,
            system_amount: 0,
            journal_amount: row.amount,
            variance_amount: row.amount,
            note: null,
          })),
        },
      },
    });
    const branch = run.branch_id
      ? await this.prisma.branch.findUnique({ where: { id: run.branch_id }, select: { name: true } })
      : null;
    return {
      id: run.id,
      runNo: run.run_no,
      provider: run.provider,
      businessDate: run.business_date,
      branchId: run.branch_id ?? null,
      branchName: branch?.name ?? null,
      parsedRowCount: input.rows.length,
      uploadedByUserId: input.createdByUserId,
      uploadedAt: run.created_at,
      status: 'PENDING_REVIEW',
    };
  }

  async listPendingJournals(branchId?: string): Promise<import('../../../domain/repositories/reconciliation.repository').PendingJournalSummary[]> {
    const runs = await this.prisma.reconciliation_runs.findMany({
      where: { status: 'PENDING_REVIEW', ...(branchId && { branch_id: branchId }) },
      include: {
        branches: { select: { name: true } },
        reconciliation_items: { select: { id: true } },
      },
      orderBy: { created_at: 'desc' },
      take: 100,
    });
    return runs.map((run: any) => ({
      id: run.id,
      runNo: run.run_no,
      provider: run.provider,
      businessDate: run.business_date,
      branchId: run.branch_id ?? null,
      branchName: run.branches?.name ?? null,
      parsedRowCount: run.reconciliation_items?.length ?? 0,
      uploadedByUserId: run.created_by_user_id,
      uploadedAt: run.created_at,
      status: 'PENDING_REVIEW' as const,
    }));
  }

  async getPendingJournal(id: string): Promise<{ summary: import('../../../domain/repositories/reconciliation.repository').PendingJournalSummary; rows: any[] } | null> {
    const run = await this.prisma.reconciliation_runs.findUnique({
      where: { id },
      include: {
        branches: { select: { name: true } },
        reconciliation_items: {
          select: { code: true, currency_code: true, branch_id: true, journal_amount: true },
        },
      },
    });
    if (!run || run.status !== 'PENDING_REVIEW') return null;
    const rows = (run as any).reconciliation_items ?? [];
    return {
      summary: {
        id: run.id,
        runNo: run.run_no,
        provider: run.provider,
        businessDate: run.business_date,
        branchId: run.branch_id ?? null,
        branchName: (run as any).branches?.name ?? null,
        parsedRowCount: rows.length,
        uploadedByUserId: run.created_by_user_id,
        uploadedAt: run.created_at,
        status: 'PENDING_REVIEW' as const,
      },
      rows: rows.map((item: any) => ({
        code: item.code,
        amount: Number(item.journal_amount),
        currencyCode: item.currency_code,
        branchId: item.branch_id,
      })),
    };
  }
}

