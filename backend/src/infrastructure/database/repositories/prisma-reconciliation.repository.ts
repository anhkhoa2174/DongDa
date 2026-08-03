// Prisma Reconciliation Repository
// Layer: Infrastructure

import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma.service';
import {
  IReconciliationRepository, SaveRunInput, ReconRunSummary,
} from '../../../domain/repositories/reconciliation.repository';
import { SystemTxn, ReconItem, ReconItemStatus } from '../../../domain/entities/reconciliation.entity';

@Injectable()
export class PrismaReconciliationRepository implements IReconciliationRepository {
  constructor(private readonly prisma: PrismaService) {}

  async listSystemTxByProvider(provider: string): Promise<SystemTxn[]> {
    const rows = await this.prisma.customer_transactions.findMany({
      where: { operation_code: provider as any, status: 'COMPLETED' },
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
        amount: Number(r.amount),
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
      // Chuỗi file → batch → rows (thỏa check constraint nguồn của item)
      const file = await tx.journal_upload_files.create({
        data: {
          provider: input.provider as any, scope: 'COMPANY', business_date: input.businessDate,
          original_file_name: `journal-${input.provider}.json`, storage_key: `inline/${rnd}`,
          file_hash: rnd, uploaded_by_user_id: input.createdByUserId,
        },
      });
      const batch = await tx.journal_batches.create({
        data: {
          journal_file_id: file.id, provider: input.provider as any, scope: 'COMPANY',
          business_date: input.businessDate, batch_no: `JB-${rnd}`, status: 'PARSED',
          row_count: journalItems.length, total_amount: result.journalTotal, currency_code: 'USD',
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
            amount: it.journalAmount, currency_code: 'USD', match_status: it.status as any,
            matched_transaction_id: it.transactionId ?? null,
          },
        });
        codeToRow.set(it.code, jr.id);
      }

      return tx.reconciliation_runs.create({
        data: {
          run_no: `RC-${rnd}`, provider: input.provider as any, scope: 'COMPANY',
          business_date: input.businessDate, status,
          system_total_amount: result.systemTotal, journal_total_amount: result.journalTotal,
          variance_amount: result.varianceTotal, created_by_user_id: input.createdByUserId, posted_at: now,
          reconciliation_items: {
            create: result.items.map((it) => ({
              journal_row_id: it.status !== 'MISSING_IN_JOURNAL' ? (codeToRow.get(it.code) ?? null) : null,
              transaction_id: it.transactionId ?? null,
              branch_id: it.branchId ?? null,
              system_amount: it.systemAmount, journal_amount: it.journalAmount, variance_amount: it.varianceAmount,
              status: it.status as any,
              note: `${it.code} · ${it.note ?? ''}`.trim(),
            })),
          },
        },
      });
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
        note: rest.join(' · ') || undefined,
      };
    });
  }

  private toSummary(run: any, matchedCount: number, totalCount: number, matchRate: number): ReconRunSummary {
    return {
      id: run.id,
      runNo: run.run_no,
      provider: run.provider,
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
}
