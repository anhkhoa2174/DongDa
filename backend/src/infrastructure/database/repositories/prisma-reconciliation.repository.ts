// Prisma Reconciliation Repository
// Layer: Infrastructure

import { Injectable, BadRequestException } from '@nestjs/common';
import { PrismaService } from '../prisma.service';
import {
  IReconciliationRepository, SaveRunInput, ReconRunSummary,
} from '../../../domain/repositories/reconciliation.repository';
import {
  SystemTxn, ReconItem, ReconItemStatus, FundReconSheet, FundReconStatus,
  isFullyMatchedReconciliation, normalizeReconciliationCode,
} from '../../../domain/entities/reconciliation.entity';
import { NotificationService } from '../../notifications/notification.service';

@Injectable()
export class PrismaReconciliationRepository implements IReconciliationRepository {
  constructor(
    private readonly prisma: PrismaService,
    private readonly notifications: NotificationService,
  ) {}

  async listSystemTxByProvider(provider: string, dateFrom: Date, dateTo: Date, branchId?: string): Promise<SystemTxn[]> {
    const rows = await this.prisma.customer_transactions.findMany({
      where: {
        operation_code: provider as any,
        status: 'COMPLETED',
        business_date: { gte: dateFrom, lte: dateTo },
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
        code: normalizeReconciliationCode(code),
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
    const stage = input.stage ?? 'FINAL';
    const postFinancial = input.postFinancial ?? false;
    const submitForFinal = input.submitForFinal ?? false;
    const dateFrom = input.dateFrom ?? input.businessDate;
    const dateTo = input.dateTo ?? input.businessDate;
    const periodKey = `${dateFrom.toISOString().slice(0, 10)}:${dateTo.toISOString().slice(0, 10)}`;
    const rnd = `${Date.now()}-${Math.floor(Math.random() * 100000)}`;

    // Các dòng có mặt trong Journal (khớp / lệch / thiếu-hệ-thống)
    const journalItems = result.items.filter((i) => i.status !== 'MISSING_IN_JOURNAL');
    // Journal rỗng và hệ thống cũng không phát sinh là một kết quả đối chiếu hợp lệ.
    const fullyMatched = isFullyMatchedReconciliation(result);
    const status = fullyMatched ? 'MATCHED' : 'PENDING_REVIEW';
    let reconciledDebtCount = 0;

    const run = await this.prisma.$transaction(async (tx) => {
      // Serialize by provider + currency, including overlapping date ranges.
      // This keeps branch submission and Final consumption in the same lock domain.
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`RECON:${input.provider}:${input.currencyCode}`}))`;
      // Một ngày có thể cần nhiều vòng Final: vòng đầu chốt ngay các dòng khớp,
      // chi nhánh sửa phần lệch rồi gửi bản mới. Chỉ bản BRANCH mới bị chặn theo
      // phạm vi ngày; Final được chống lặp bằng sourceRunIds đã tiêu thụ.
      const posted = postFinancial && stage !== 'FINAL' ? await tx.reconciliation_runs.findFirst({
        where: {
          provider: input.provider as any,
          scope: input.scope,
          branch_id: input.branchId ?? null,
          period_from: { lte: dateTo },
          period_to: { gte: dateFrom },
          currency_code: input.currencyCode,
          status: 'MATCHED',
          posted_at: { not: null },
        },
      }) : null;
      if (posted) {
        throw new BadRequestException('Journal ngày/phạm vi này đã được đối chiếu và ghi công nợ thực tế');
      }
      if (stage === 'FINAL') {
        if (!input.sourceRunIds?.length) {
          throw new BadRequestException('Bản đối chiếu tổng phải có các bản chi nhánh nguồn');
        }
        const availableSourceCount = await tx.reconciliation_runs.count({
          where: {
            id: { in: input.sourceRunIds },
            provider: input.provider as any,
            stage: 'BRANCH',
            period_from: dateFrom,
            period_to: dateTo,
            currency_code: input.currencyCode,
            submitted_at: { not: null },
            final_targets: { none: {} },
          },
        });
        if (availableSourceCount !== input.sourceRunIds.length) {
          throw new BadRequestException('Có bản chi nhánh đã được một lần đối chiếu Final khác sử dụng');
        }
      }
      if (submitForFinal) {
        // Final cũ không khóa cả ngày. Nếu còn giao dịch phát sinh muộn hoặc một
        // dòng PENDING đã được sửa, chi nhánh phải được gửi một branch run mới.
        // Mỗi branch run vẫn chỉ được tiêu thụ một lần bởi final_targets + unique DB.
        const waiting = await tx.reconciliation_runs.findFirst({
          where: {
            provider: input.provider as any, stage: 'BRANCH', branch_id: input.branchId ?? null,
            period_from: { lte: dateTo }, period_to: { gte: dateFrom }, currency_code: input.currencyCode,
            submitted_at: { not: null }, final_targets: { none: {} },
          },
        });
        if (waiting) {
          throw new BadRequestException('Chi nhánh đã có một bản trùng hoặc chồng lấn khoảng ngày đang chờ tổng hợp');
        }
      }

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
      // Một Final có thể nhận cùng mã từ hai bản chi nhánh. Giữ hàng đợi theo
      // mã + loại tiền để mỗi reconciliation item trỏ đúng một journal row.
      const journalRowIds = new Map<string, string[]>();
      let rowNo = 1;
      for (const it of journalItems) {
        const jr = await tx.journal_rows.create({
          data: {
            journal_batch_id: batch.id, row_no: rowNo++, external_reference: it.code,
            matched_branch_id: it.branchId ?? null,
            customer_name: it.customerName?.slice(0, 255) ?? null,
            amount: it.journalAmount, currency_code: it.currencyCode, match_status: it.status as any,
            matched_transaction_id: it.transactionId ?? null,
          },
        });
        const rowKey = `${normalizeReconciliationCode(it.code)}::${it.currencyCode}`;
        const ids = journalRowIds.get(rowKey) ?? [];
        ids.push(jr.id);
        journalRowIds.set(rowKey, ids);
      }

      const createdRun = await tx.reconciliation_runs.create({
        data: {
          run_no: `RC-${rnd}`, provider: input.provider as any, scope: input.scope, branch_id: input.branchId ?? null,
          business_date: dateTo, period_from: dateFrom, period_to: dateTo, status,
          stage,
          currency_code: input.currencyCode,
          system_total_amount: result.systemTotal, journal_total_amount: result.journalTotal,
          variance_amount: result.varianceTotal, created_by_user_id: input.createdByUserId,
          posted_at: postFinancial ? now : null,
          submitted_at: submitForFinal ? now : null,
          reconciliation_items: {
            create: result.items.map((it) => {
              const rowKey = `${normalizeReconciliationCode(it.code)}::${it.currencyCode}`;
              const journalRowId = it.status !== 'MISSING_IN_JOURNAL'
                ? (journalRowIds.get(rowKey)?.shift() ?? null)
                : null;
              return ({
                code: it.code,
                journal_row_id: journalRowId,
                transaction_id: it.transactionId ?? null,
                branch_id: it.branchId ?? null,
                system_amount: it.systemAmount, journal_amount: it.journalAmount, variance_amount: it.varianceAmount,
                currency_code: it.currencyCode,
                status: it.status as any,
                note: `${it.code} · ${it.note ?? ''}`.trim(),
              });
            }),
          },
        },
      });

      // Mọi bản chi nhánh đã tham gia Final đều được tiêu thụ đúng một lần. Không xóa
      // vật lý để giữ audit; final_targets làm bản cũ rời hàng chờ. Nếu Final lệch,
      // chi nhánh phải sửa giao dịch và gửi một bản đối chiếu chi nhánh mới.
      if (input.sourceRunIds?.length) {
        await tx.reconciliation_final_sources.createMany({
          data: input.sourceRunIds.map((branchRunId) => ({ final_run_id: createdRun.id, branch_run_id: branchRunId })),
        });
        await tx.reconciliation_runs.updateMany({
          where: { id: { in: input.sourceRunIds } },
          data: {
            reviewed_by_user_id: input.createdByUserId,
            ...(postFinancial ? { approved_by_user_id: input.createdByUserId } : {}),
            updated_at: now,
          },
        });
      }
      if (postFinancial) {
        reconciledDebtCount = await this.postActualDebt(tx, createdRun.id, result.items, now);
      }
      const discrepancies = result.items.filter((item) => item.status !== ReconItemStatus.MATCHED);
      if (discrepancies.length > 0 && stage === 'FINAL') {
        const statusCounts = discrepancies.reduce<Record<string, number>>((counts, item) => {
          counts[item.status] = (counts[item.status] ?? 0) + 1;
          return counts;
        }, {});
        const statusLabel: Record<string, string> = {
          [ReconItemStatus.AMOUNT_VARIANCE]: 'lệch số tiền',
          [ReconItemStatus.MISSING_IN_SYSTEM]: 'thiếu trên hệ thống',
          [ReconItemStatus.MISSING_IN_JOURNAL]: 'thiếu trong Journal',
          [ReconItemStatus.DUPLICATE_IN_JOURNAL]: 'trùng trong Journal',
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
          body: `Kỳ ${periodKey.replace(':', ' - ')}: ${discrepancies.length}/${result.totalCount} dòng cần xử lý (${details}); chênh lệch tổng ${result.varianceTotal.toLocaleString('vi-VN')} ${input.currencyCode}.`,
          sourceType: 'RECONCILIATION_VARIANCE',
          sourceId: createdRun.id,
        }, {
          userIds: [input.createdByUserId],
          roles: ['ADMIN', 'MANAGER'],
          branchIds: affectedBranchIds,
        }, tx);
      }
      if (submitForFinal) {
        await this.notifications.notifyUsers({
          title: `Bản đối chiếu ${input.provider} chờ tổng hợp`,
          body: `${createdRun.run_no}, kỳ ${periodKey.replace(':', ' - ')}, ${input.currencyCode} đã được chi nhánh đối chiếu và gửi tự động.`,
          sourceType: `${input.provider}_BRANCH_RECON_SUBMITTED`,
          sourceId: createdRun.id,
        }, { roles: ['ADMIN', 'MANAGER'] }, tx);
      }
      return createdRun;
    });

    return {
      ...this.toSummary(run, result.matchedCount, result.totalCount, result.matchRate),
      reconciledDebtCount,
    };
  }

  async listRuns(branchId?: string, provider?: 'WU' | 'MG'): Promise<ReconRunSummary[]> {
    const runs = await this.prisma.reconciliation_runs.findMany({
      where: {
        ...(branchId ? { branch_id: branchId } : {}),
        ...(provider ? { provider } : {}),
        run_no: { not: { startsWith: 'PEND-' } },
      },
      include: { branches: { select: { code: true, name: true } } },
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

  async findRun(runId: string): Promise<ReconRunSummary | null> {
    const run = await this.prisma.reconciliation_runs.findUnique({
      where: { id: runId },
      include: { branches: { select: { code: true, name: true } } },
    });
    if (!run) return null;
    const grouped = await this.prisma.reconciliation_items.groupBy({
      by: ['status'],
      where: { reconciliation_run_id: run.id },
      _count: { _all: true },
    });
    const total = grouped.reduce((s, g) => s + g._count._all, 0);
    const matched = grouped.find((g) => g.status === 'MATCHED')?._count._all ?? 0;
    return this.toSummary(run, matched, total, total > 0 ? matched / total : 1);
  }

  async getItems(runId: string): Promise<ReconItem[]> {
    const rows = await this.prisma.reconciliation_items.findMany({
      where: { reconciliation_run_id: runId },
      include: {
        journal_rows: { select: { currency_code: true, customer_name: true } },
        customer_transactions: { select: { customer_name: true } },
      },
      orderBy: { created_at: 'asc' },
    });
    return rows.map((r: any) => {
      const [legacyCode, ...rest] = (r.note ?? '').split(' · ');
      return {
        status: r.status as ReconItemStatus,
        code: r.code ?? legacyCode ?? '',
        transactionId: r.transaction_id ?? null,
        branchId: r.branch_id ?? null,
        systemAmount: Number(r.system_amount),
        journalAmount: Number(r.journal_amount),
        varianceAmount: Number(r.variance_amount),
        currencyCode: r.currency_code as 'USD' | 'VND',
        customerName: r.journal_rows?.customer_name ?? r.customer_transactions?.customer_name ?? null,
        note: rest.join(' · ') || undefined,
      };
    });
  }

  async submitBranchRun(provider: 'WU' | 'MG', runId: string, submittedByUserId: string): Promise<ReconRunSummary> {
    const run = await this.prisma.$transaction(async (tx) => {
      await tx.$executeRaw`SELECT id FROM reconciliation_runs WHERE id = ${runId}::uuid FOR UPDATE`;
      const current = await tx.reconciliation_runs.findUnique({ where: { id: runId } });
      if (!current || current.provider !== provider || current.stage !== 'BRANCH') {
        throw new BadRequestException(`Bản đối chiếu ${provider} chi nhánh không hợp lệ`);
      }
      if (current.submitted_at) throw new BadRequestException('Bản đối chiếu này đã được gửi');
      const duplicate = await tx.reconciliation_runs.findFirst({
        where: {
          id: { not: runId }, provider, stage: 'BRANCH', branch_id: current.branch_id,
          period_from: { lte: current.period_to }, period_to: { gte: current.period_from },
          currency_code: current.currency_code,
          submitted_at: { not: null }, final_targets: { none: {} },
        },
      });
      if (duplicate) {
        throw new BadRequestException('Chi nhánh đã có một bản trùng hoặc chồng lấn khoảng ngày đang chờ tổng hợp');
      }
      return tx.reconciliation_runs.update({
        where: { id: runId },
        data: { submitted_at: new Date(), reviewed_by_user_id: submittedByUserId, updated_at: new Date() },
        include: { branches: { select: { code: true, name: true } } },
      });
    });
    const items = await this.countRunItems(run.id);
    return this.toSummary(run, items.matched, items.total, items.rate);
  }

  async listSubmittedBranchRuns(provider: 'WU' | 'MG', branchId?: string): Promise<ReconRunSummary[]> {
    const runs = await this.prisma.reconciliation_runs.findMany({
      where: {
        provider, stage: 'BRANCH', submitted_at: { not: null },
        ...(branchId ? { branch_id: branchId } : {}),
        final_targets: { none: {} },
      },
      include: { branches: { select: { code: true, name: true } } },
      orderBy: [{ period_to: 'desc' }, { created_at: 'desc' }],
    });
    return Promise.all(runs.map(async (run) => {
      const items = await this.countRunItems(run.id);
      return this.toSummary(run, items.matched, items.total, items.rate);
    }));
  }

  async getBranchRunsForFinal(provider: 'WU' | 'MG', runIds: string[]): Promise<import('../../../domain/repositories/reconciliation.repository').BranchRunForFinal[]> {
    const runs = await this.prisma.reconciliation_runs.findMany({
      where: {
        id: { in: runIds }, provider, stage: 'BRANCH', submitted_at: { not: null },
        final_targets: { none: {} },
      },
      include: {
        branches: { select: { code: true, name: true } },
        reconciliation_items: {
          where: { status: { not: 'MISSING_IN_JOURNAL' } },
          include: { journal_rows: { select: { customer_name: true } } },
          orderBy: { created_at: 'asc' },
        },
      },
    });
    return Promise.all(runs.map(async (run) => {
      const counts = await this.countRunItems(run.id);
      return {
        summary: this.toSummary(run, counts.matched, counts.total, counts.rate),
        rows: run.reconciliation_items.map((item) => ({
          code: item.code ?? (item.note ?? '').split(' · ')[0],
          amount: Number(item.journal_amount),
          currencyCode: item.currency_code as 'USD' | 'VND',
          branchId: item.branch_id!,
          customerName: item.journal_rows?.customer_name ?? null,
        })),
      };
    }));
  }

  private async countRunItems(runId: string) {
    const grouped = await this.prisma.reconciliation_items.groupBy({
      by: ['status'], where: { reconciliation_run_id: runId }, _count: { _all: true },
    });
    const total = grouped.reduce((sum, group) => sum + group._count._all, 0);
    const matched = grouped.find((group) => group.status === 'MATCHED')?._count._all ?? 0;
    return { matched, total, rate: total > 0 ? matched / total : 1 };
  }

  // F9.1 — Lịch sử phiếu kiểm quỹ đầu/ cuối ca đã POSTED.
  async fundReconciliation(branchId?: string): Promise<FundReconSheet[]> {
    const counts = await this.prisma.cash_counts.findMany({
      where: { status: 'POSTED', ...(branchId ? { branch_id: branchId } : {}) },
      orderBy: [{ shift_id: 'asc' }, { counted_at: 'asc' }],
      include: {
        branches: { select: { code: true, name: true } },
        shifts: { select: { shift_code: true, status: true } },
        users_cash_counts_counted_by_user_idTousers: {
          select: { username: true, employees: { select: { full_name: true } } },
        },
        cash_count_lines: {
          orderBy: { currency_code: 'asc' },
          select: {
            currency_code: true,
            system_amount: true,
            actual_amount: true,
            variance: true,
          },
        },
      },
    });

    const countsByShift = new Map<string, typeof counts>();
    for (const count of counts) {
      const shiftKey = count.shift_id ?? `LEGACY:${count.id}`;
      const shiftCounts = countsByShift.get(shiftKey) ?? [];
      shiftCounts.push(count);
      countsByShift.set(shiftKey, shiftCounts);
    }

    const displayedCounts = [...countsByShift.values()].flatMap((shiftCounts) => {
      const opening = shiftCounts[0];
      const closing = opening.shifts?.status === 'CLOSED' && shiftCounts.length > 1
        ? shiftCounts[shiftCounts.length - 1]
        : null;
      return closing ? [opening, closing] : [opening];
    });

    return displayedCounts.map((count) => {
      const shiftKey = count.shift_id ?? `LEGACY:${count.id}`;
      const shiftCounts = countsByShift.get(shiftKey) ?? [];
      const countType: FundReconSheet['countType'] = count.id === shiftCounts[0]?.id
        ? 'OPENING'
        : 'CLOSING';
      const lines = count.cash_count_lines.map((line) => {
        const variance = Number(line.variance);
        const status: FundReconStatus = Math.abs(variance) < 0.01
          ? 'MATCH'
          : variance > 0 ? 'OVERAGE' : 'SHORTAGE';
        return {
          currencyCode: String(line.currency_code),
          systemBalance: Number(line.system_amount),
          physicalActual: Number(line.actual_amount),
          variance,
          status,
        };
      });
      const varianceCount = lines.filter((line) => line.status !== 'MATCH').length;
      return {
        id: count.id,
        countType,
        branchId: count.branch_id,
        branchCode: count.branches.code,
        branchName: count.branches.name,
        shiftId: count.shift_id,
        shiftCode: count.shifts?.shift_code ?? null,
        businessDate: count.business_date,
        countedAt: count.counted_at,
        countedByName: count.users_cash_counts_counted_by_user_idTousers.employees.full_name
          || count.users_cash_counts_counted_by_user_idTousers.username,
        note: count.note,
        status: varianceCount > 0 ? 'VARIANCE' as const : 'MATCH' as const,
        matchedCount: lines.length - varianceCount,
        varianceCount,
        lines,
      };
    }).sort((first, second) => second.countedAt.getTime() - first.countedAt.getTime());
  }

  private toSummary(run: any, matchedCount: number, totalCount: number, matchRate: number): ReconRunSummary {
    return {
      id: run.id,
      runNo: run.run_no,
      provider: run.provider,
      scope: run.scope,
      branchId: run.branch_id ?? null,
      branchCode: run.branches?.code ?? null,
      currencyCode: run.currency_code,
      businessDate: run.business_date,
      dateFrom: run.period_from ?? run.business_date,
      dateTo: run.period_to ?? run.business_date,
      status: run.status,
      stage: run.stage ?? (run.posted_at ? 'FINAL' : 'BRANCH'),
      systemTotal: Number(run.system_total_amount),
      journalTotal: Number(run.journal_total_amount),
      varianceTotal: Number(run.variance_amount),
      matchRate,
      matchedCount,
      totalCount,
      createdAt: run.created_at,
      submittedAt: run.submitted_at ?? null,
      branchName: run.branches?.name ?? null,
    };
  }

  private async postActualDebt(tx: any, runId: string, items: ReconItem[], now: Date): Promise<number> {
    const transactionIds = [...new Set(items
      .filter((item) => item.status === ReconItemStatus.MATCHED && item.transactionId)
      .map((item) => item.transactionId as string))];
    if (transactionIds.length === 0) {
      return 0;
    }

    const accountRefs = await tx.debt_accounts.findMany({
      where: { transaction_id: { in: transactionIds } },
      select: { id: true },
    });
    if (accountRefs.length !== transactionIds.length) {
      throw new BadRequestException('Có giao dịch chưa phát sinh đúng một công nợ; chưa thể chốt đối chiếu');
    }

    // Transaction administration also locks transaction -> debt in this order.
    // Keeping the same order prevents reconciliation and void/replace from crossing.
    for (const transactionId of [...transactionIds].sort()) {
      await tx.$executeRaw`SELECT id FROM customer_transactions WHERE id = ${transactionId}::uuid FOR UPDATE`;
    }
    for (const accountId of accountRefs.map((account: any) => account.id).sort()) {
      await tx.$executeRaw`SELECT id FROM debt_accounts WHERE id = ${accountId}::uuid FOR UPDATE`;
    }
    const accounts = await tx.debt_accounts.findMany({
      where: { id: { in: accountRefs.map((account: any) => account.id) } },
      select: { id: true, transaction_id: true, lifecycle_status: true, currency_code: true },
    });
    const invalid = accounts.find((account: any) => !['PENDING', 'RECONCILED', 'SETTLED'].includes(account.lifecycle_status));
    if (invalid) {
      throw new BadRequestException(`Công nợ giao dịch ${invalid.transaction_id} không còn hợp lệ để đối chiếu`);
    }
    const itemByTransactionId = new Map(items
      .filter((item) => item.status === ReconItemStatus.MATCHED && item.transactionId)
      .map((item) => [item.transactionId as string, item]));
    const currencyMismatch = accounts.find((account: any) =>
      account.currency_code !== itemByTransactionId.get(account.transaction_id)?.currencyCode);
    if (currencyMismatch) {
      throw new BadRequestException(
        `Loại tiền công nợ giao dịch ${currencyMismatch.transaction_id} không khớp bản đối chiếu`,
      );
    }

    const pendingAccountIds = accounts
      .filter((account: any) => account.lifecycle_status === 'PENDING')
      .map((account: any) => account.id);
    if (pendingAccountIds.length === 0) return 0;

    const reconciled = await tx.debt_accounts.updateMany({
      where: { id: { in: pendingAccountIds }, lifecycle_status: 'PENDING' },
      data: {
        lifecycle_status: 'RECONCILED',
        reconciliation_run_id: runId,
        reconciled_at: now,
        updated_at: now,
      },
    });
    if (reconciled.count !== pendingAccountIds.length) {
      throw new BadRequestException('Trạng thái công nợ vừa thay đổi; vui lòng chạy đối chiếu lại');
    }
    return reconciled.count;
  }

  // ─── PENDING JOURNAL (DongDav6: chi nhánh upload → KTTH/GĐ duyệt) ───────────
  // Lưu thành chuỗi journal_upload_files → journal_batches → journal_rows (đúng data model, có tên KH),
  // và 1 reconciliation_runs (run_no PEND-*, status PENDING_REVIEW, posted_at NULL) với items JOURNAL_ONLY
  // trỏ tới journal_row (thỏa chk_reconciliation_item_source). Khi KTTH duyệt sẽ chạy đối chiếu thật.

  async savePendingJournal(
    input: import('../../../domain/repositories/reconciliation.repository').SavePendingJournalInput,
  ): Promise<import('../../../domain/repositories/reconciliation.repository').PendingJournalSummary> {
    const now = new Date();
    const rnd = `${Date.now()}-${Math.floor(Math.random() * 100000)}`;
    const scope: 'BRANCH' | 'COMPANY' = input.branchId ? 'BRANCH' : 'COMPANY';
    const currencyCode = (input.rows[0]?.currencyCode ?? 'USD') as any;
    const journalTotal = input.rows.reduce((s, r) => s + r.amount, 0);

    const run = await this.prisma.$transaction(async (tx) => {
      const file = await tx.journal_upload_files.create({
        data: {
          provider: input.provider as any, scope, branch_id: input.branchId ?? null, business_date: input.businessDate,
          original_file_name: `journal-${input.provider}-pending.json`, storage_key: `pending/${rnd}`,
          file_hash: rnd, uploaded_by_user_id: input.createdByUserId,
        },
      });
      const batch = await tx.journal_batches.create({
        data: {
          journal_file_id: file.id, provider: input.provider as any, scope, branch_id: input.branchId ?? null,
          business_date: input.businessDate, batch_no: `JB-PEND-${rnd}`, status: 'PARSED',
          row_count: input.rows.length, total_amount: journalTotal, currency_code: currencyCode, parsed_at: now,
        },
      });
      const rowIds: string[] = [];
      for (let i = 0; i < input.rows.length; i++) {
        const r = input.rows[i];
        const jr = await tx.journal_rows.create({
          data: {
            journal_batch_id: batch.id, row_no: i + 1, external_reference: r.code,
            matched_branch_id: r.branchId ?? input.branchId ?? null,
            customer_name: r.customerName?.slice(0, 255) ?? null,
            amount: r.amount, currency_code: r.currencyCode as any, match_status: 'MISSING_IN_SYSTEM',
          },
        });
        rowIds.push(jr.id);
      }
      return tx.reconciliation_runs.create({
        data: {
          run_no: `PEND-${input.provider}-${rnd}`,
          provider: input.provider as any,
          business_date: input.businessDate,
          period_from: input.businessDate,
          period_to: input.businessDate,
          scope,
          branch_id: input.branchId ?? null,
          currency_code: currencyCode,
          status: 'PENDING_REVIEW',
          system_total_amount: 0,
          journal_total_amount: journalTotal,
          variance_amount: 0,
          created_by_user_id: input.createdByUserId,
          reconciliation_items: {
            create: input.rows.map((row, i) => ({
              journal_row_id: rowIds[i],
              status: 'JOURNAL_ONLY',
              code: row.code,
              currency_code: row.currencyCode as any,
              branch_id: row.branchId ?? input.branchId ?? null,
              system_amount: 0,
              journal_amount: row.amount,
              variance_amount: row.amount,
            })),
          },
        },
        include: { branches: { select: { name: true } } },
      });
    });
    return this.toPendingSummary(run, input.rows.length);
  }

  async updatePendingJournalStatus(id: string, status: 'APPROVED' | 'REJECTED', userId: string): Promise<boolean> {
    const res = await this.prisma.reconciliation_runs.updateMany({
      where: { id, ...this.pendingWhere() },
      data: { status, reviewed_by_user_id: userId, ...(status === 'APPROVED' ? { approved_by_user_id: userId } : {}), updated_at: new Date() },
    });
    return res.count > 0;
  }

  private pendingWhere(branchId?: string, provider?: 'WU' | 'MG') {
    return {
      status: 'PENDING_REVIEW' as const,
      posted_at: null,
      run_no: { startsWith: 'PEND-' },
      ...(branchId && { branch_id: branchId }),
      ...(provider && { provider }),
    };
  }

  private toPendingSummary(run: any, rowCount: number) {
    return {
      id: run.id,
      runNo: run.run_no,
      provider: run.provider,
      businessDate: run.business_date,
      branchId: run.branch_id ?? null,
      branchName: run.branches?.name ?? null,
      parsedRowCount: rowCount,
      uploadedByUserId: run.created_by_user_id,
      uploadedAt: run.created_at,
      status: 'PENDING_REVIEW' as const,
    };
  }

  async listPendingJournals(branchId?: string, provider?: 'WU' | 'MG'): Promise<import('../../../domain/repositories/reconciliation.repository').PendingJournalSummary[]> {
    const runs = await this.prisma.reconciliation_runs.findMany({
      where: this.pendingWhere(branchId, provider),
      include: { branches: { select: { name: true } }, _count: { select: { reconciliation_items: true } } },
      orderBy: { created_at: 'desc' },
      take: 100,
    });
    return runs.map((run) => this.toPendingSummary(run, run._count.reconciliation_items));
  }

  async getPendingJournal(id: string): Promise<{ summary: import('../../../domain/repositories/reconciliation.repository').PendingJournalSummary; rows: any[] } | null> {
    const run = await this.prisma.reconciliation_runs.findFirst({
      where: { id, ...this.pendingWhere() },
      include: {
        branches: { select: { name: true } },
        reconciliation_items: {
          select: { code: true, currency_code: true, branch_id: true, journal_amount: true, journal_rows: { select: { customer_name: true } } },
          orderBy: { created_at: 'asc' },
        },
      },
    });
    if (!run) return null;
    return {
      summary: this.toPendingSummary(run, run.reconciliation_items.length),
      rows: run.reconciliation_items.map((item) => ({
        code: item.code,
        amount: Number(item.journal_amount),
        currencyCode: item.currency_code,
        branchId: item.branch_id,
        customerName: item.journal_rows?.customer_name ?? null,
      })),
    };
  }
}
