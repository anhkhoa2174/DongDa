import { BadRequestException } from '@nestjs/common';
import { ReconItemStatus } from '../../../domain/entities/reconciliation.entity';
import { UserRole } from '../../../domain/entities/user.entity';
import { CreateProviderFinalRunUseCase, RunReconciliationUseCase } from './reconciliation.use-cases';

const BUSINESS_DATE = new Date('2026-09-18T00:00:00.000Z');
const BRANCH_A = '00000000-0000-0000-0000-000000000001';
const BRANCH_B = '00000000-0000-0000-0000-000000000002';
const BRANCH_C = '00000000-0000-0000-0000-000000000003';
const admin = { id: 'admin', role: UserRole.ADMIN, branchId: null };

type TransactionState = {
  id: string;
  code: string;
  branchId: string;
  amount: number;
  businessDate: Date;
  status: 'COMPLETED' | 'VOIDED';
  debtStatus: 'PENDING' | 'RECONCILED' | 'CANCELLED';
  revision: number;
};

/**
 * Fake có trạng thái để kiểm tra cả vòng đời. Các phép match dùng use case thật;
 * fake chỉ thay DB bằng Map và mô phỏng đúng quy tắc post debt của repository.
 */
class MultiBranchWorkflowRepository {
  readonly transactions = new Map<string, TransactionState>();
  readonly runs = new Map<string, any>();
  readonly consumedBranchRuns = new Set<string>();
  private runSequence = 0;
  private transactionSequence = 0;

  createTransaction(input: Omit<TransactionState, 'status' | 'debtStatus' | 'revision'>) {
    const transaction: TransactionState = {
      ...input,
      status: 'COMPLETED',
      debtStatus: 'PENDING',
      revision: 1,
    };
    this.transactions.set(transaction.id, transaction);
    return transaction;
  }

  replaceTransaction(transactionId: string, amount: number) {
    const original = this.requirePendingTransaction(transactionId);
    original.status = 'VOIDED';
    original.debtStatus = 'CANCELLED';
    const replacement: TransactionState = {
      ...original,
      id: `${original.id}-r${++this.transactionSequence}`,
      amount,
      status: 'COMPLETED',
      debtStatus: 'PENDING',
      revision: original.revision + 1,
      // Quy tắc cần kiểm chứng: sửa hôm sau vẫn thuộc ngày nghiệp vụ gốc.
      businessDate: original.businessDate,
    };
    this.transactions.set(replacement.id, replacement);
    return replacement;
  }

  voidTransaction(transactionId: string) {
    const transaction = this.requirePendingTransaction(transactionId);
    transaction.status = 'VOIDED';
    transaction.debtStatus = 'CANCELLED';
    return transaction;
  }

  async listSystemTxByProvider(
    _provider: string,
    dateFrom: Date,
    dateTo: Date,
    branchId?: string,
  ) {
    return [...this.transactions.values()]
      .filter((transaction) => transaction.status === 'COMPLETED')
      .filter((transaction) => transaction.businessDate >= dateFrom && transaction.businessDate <= dateTo)
      .filter((transaction) => !branchId || transaction.branchId === branchId)
      .map((transaction) => ({
        code: transaction.code,
        transactionId: transaction.id,
        branchId: transaction.branchId,
        amount: transaction.amount,
        currencyCode: 'USD' as const,
      }));
  }

  async saveRun(input: any) {
    const id = `run-${++this.runSequence}`;
    const submittedAt = input.stage === 'BRANCH' ? new Date('2026-09-18T10:00:00.000Z') : null;
    const summary = {
      id,
      runNo: `RC-${this.runSequence}`,
      provider: input.provider,
      scope: input.scope,
      branchId: input.branchId,
      branchCode: input.branchId,
      currencyCode: input.currencyCode,
      businessDate: input.businessDate,
      dateFrom: input.dateFrom,
      dateTo: input.dateTo,
      status: input.result.items.every((item: any) => item.status === ReconItemStatus.MATCHED) ? 'MATCHED' : 'VARIANCE',
      stage: input.stage,
      systemTotal: input.result.systemTotal,
      journalTotal: input.result.journalTotal,
      varianceTotal: input.result.varianceTotal,
      matchRate: input.result.matchRate,
      matchedCount: input.result.matchedCount,
      totalCount: input.result.totalCount,
      createdAt: new Date('2026-09-18T09:00:00.000Z'),
      submittedAt,
    };
    const rows = input.result.items
      .filter((item: any) => item.status !== ReconItemStatus.MISSING_IN_JOURNAL)
      .map((item: any) => ({
        code: item.code,
        amount: item.journalAmount,
        currencyCode: item.currencyCode,
        branchId: item.branchId,
      }));
    const run = { id, summary, rows, result: input.result };
    this.runs.set(id, run);

    if (input.stage === 'FINAL') {
      input.sourceRunIds.forEach((sourceId: string) => this.consumedBranchRuns.add(sourceId));
      if (input.postFinancial) {
        for (const item of input.result.items) {
          if (item.status !== ReconItemStatus.MATCHED || !item.transactionId) continue;
          const transaction = this.transactions.get(item.transactionId);
          if (transaction?.debtStatus === 'PENDING') transaction.debtStatus = 'RECONCILED';
        }
      }
    }
    return summary;
  }

  async getBranchRunsForFinal(_provider: string, ids: string[]) {
    return ids
      .filter((id) => !this.consumedBranchRuns.has(id))
      .map((id) => this.runs.get(id))
      .filter((run) => run?.summary.stage === 'BRANCH');
  }

  async listSubmittedBranchRuns() {
    return [...this.runs.values()]
      .filter((run) => run.summary.stage === 'BRANCH' && !this.consumedBranchRuns.has(run.id))
      .map((run) => run.summary);
  }

  private requirePendingTransaction(transactionId: string) {
    const transaction = this.transactions.get(transactionId);
    if (!transaction || transaction.status !== 'COMPLETED') {
      throw new BadRequestException('Giao dịch không còn hiệu lực');
    }
    if (transaction.debtStatus !== 'PENDING') {
      throw new BadRequestException('Chỉ được sửa/xóa giao dịch có công nợ PENDING');
    }
    return transaction;
  }
}

describe('Luồng mẫu nhiều chi nhánh: đối chiếu sai → sửa/xóa → đối chiếu lại', () => {
  it('chỉ chốt công nợ khớp, giữ ngày gốc và cho vòng đối chiếu thứ hai kết thúc đúng', async () => {
    const repo = new MultiBranchWorkflowRepository();
    repo.createTransaction({ id: 'tx-a', code: '1111111111', branchId: BRANCH_A, amount: 90, businessDate: BUSINESS_DATE });
    repo.createTransaction({ id: 'tx-b', code: '2222222222', branchId: BRANCH_B, amount: 200, businessDate: BUSINESS_DATE });
    repo.createTransaction({ id: 'tx-c', code: '3333333333', branchId: BRANCH_C, amount: 300, businessDate: BUSINESS_DATE });

    const branchUseCase = new RunReconciliationUseCase(repo as any);
    const finalUseCase = new CreateProviderFinalRunUseCase(repo as any);
    const runBranch = (branchId: string, rows: Array<{ code: string; amount: number }>) => branchUseCase.execute({
      provider: 'WU',
      businessDate: '2026-09-18',
      currencyCode: 'USD',
      rows: rows.map((row) => ({ ...row, currencyCode: 'USD' as const })),
    }, { id: `staff-${branchId}`, role: UserRole.STAFF, branchId });

    // Vòng 1: A lệch số tiền, B khớp, C có giao dịch nhưng Journal thiếu.
    const [branchA1, branchB1, branchC1] = await Promise.all([
      runBranch(BRANCH_A, [{ code: '111-111-1111', amount: 100 }]),
      runBranch(BRANCH_B, [{ code: '2222222222', amount: 200 }]),
      runBranch(BRANCH_C, []),
    ]);
    expect(repo.runs.get(branchA1.id).result.items)
      .toEqual([expect.objectContaining({ status: ReconItemStatus.AMOUNT_VARIANCE })]);
    expect(repo.runs.get(branchB1.id).result.items)
      .toEqual([expect.objectContaining({ status: ReconItemStatus.MATCHED })]);
    expect(repo.runs.get(branchC1.id).result.items)
      .toEqual([expect.objectContaining({ status: ReconItemStatus.MISSING_IN_JOURNAL })]);

    const final1 = await finalUseCase.execute('WU', [branchA1.id, branchB1.id, branchC1.id], admin);
    expect(final1).toEqual(expect.objectContaining({ matchedCount: 1, totalCount: 3 }));
    expect(repo.transactions.get('tx-a')?.debtStatus).toBe('PENDING');
    expect(repo.transactions.get('tx-b')?.debtStatus).toBe('RECONCILED');
    expect(repo.transactions.get('tx-c')?.debtStatus).toBe('PENDING');
    expect(() => repo.replaceTransaction('tx-b', 250)).toThrow('công nợ PENDING');

    // A sửa số tiền: transaction/debt cũ bị hủy, revision mới vẫn thuộc ngày 18/09.
    const replacementA = repo.replaceTransaction('tx-a', 100);
    expect(repo.transactions.get('tx-a')).toEqual(expect.objectContaining({ status: 'VOIDED', debtStatus: 'CANCELLED' }));
    expect(replacementA).toEqual(expect.objectContaining({
      status: 'COMPLETED', debtStatus: 'PENDING', revision: 2, businessDate: BUSINESS_DATE,
    }));

    // C xác định là giao dịch tạo nhầm: xóa và đảo sổ, không còn ở tập đối chiếu.
    repo.voidTransaction('tx-c');
    expect(repo.transactions.get('tx-c')).toEqual(expect.objectContaining({ status: 'VOIDED', debtStatus: 'CANCELLED' }));

    // Mỗi bản chi nhánh vòng 1 chỉ được Final tiêu thụ một lần.
    await expect(finalUseCase.execute('WU', [branchA1.id], admin))
      .rejects.toThrow('không tồn tại hoặc đã được tổng hợp');

    // Vòng 2: A gửi lại Journal và khớp revision; C gửi bản rỗng hợp lệ sau khi xóa.
    const [branchA2, branchC2] = await Promise.all([
      runBranch(BRANCH_A, [{ code: '1111111111', amount: 100 }]),
      runBranch(BRANCH_C, []),
    ]);
    const final2 = await finalUseCase.execute('WU', [branchA2.id, branchC2.id], admin);

    expect(final2).toEqual(expect.objectContaining({ matchedCount: 1, totalCount: 1, matchRate: 1 }));
    expect(repo.transactions.get(replacementA.id)?.debtStatus).toBe('RECONCILED');
    expect(repo.transactions.get('tx-c')?.debtStatus).toBe('CANCELLED');
    expect([...repo.transactions.values()].filter((transaction) => transaction.debtStatus === 'RECONCILED'))
      .toEqual(expect.arrayContaining([
        expect.objectContaining({ id: 'tx-b' }),
        expect.objectContaining({ id: replacementA.id, businessDate: BUSINESS_DATE }),
      ]));
  });

  describe('Journal được upload ở chi nhánh khác giao dịch', () => {
    const createUseCases = (repo: MultiBranchWorkflowRepository) => ({
      branch: new RunReconciliationUseCase(repo as any),
      final: new CreateProviderFinalRunUseCase(repo as any),
    });
    const runBranch = (
      useCase: RunReconciliationUseCase,
      branchId: string,
      rows: Array<{ code: string; amount: number }>,
    ) => useCase.execute({
      provider: 'WU',
      businessDate: '2026-09-18',
      currencyCode: 'USD',
      rows: rows.map((row) => ({ ...row, currencyCode: 'USD' as const })),
    }, { id: `staff-${branchId}`, role: UserRole.STAFF, branchId });

    it('khớp tại Final khi chọn cả chi nhánh có giao dịch và chi nhánh có Journal', async () => {
      const repo = new MultiBranchWorkflowRepository();
      repo.createTransaction({
        id: 'tx-cross-branch', code: '4444444444', branchId: BRANCH_A,
        amount: 400, businessDate: BUSINESS_DATE,
      });
      const useCases = createUseCases(repo);

      const branchA = await runBranch(useCases.branch, BRANCH_A, []);
      const branchB = await runBranch(useCases.branch, BRANCH_B, [
        { code: '444-444-4444', amount: 400 },
      ]);

      expect(repo.runs.get(branchA.id).result.items)
        .toEqual([expect.objectContaining({ status: ReconItemStatus.MISSING_IN_JOURNAL })]);
      expect(repo.runs.get(branchB.id).result.items)
        .toEqual([expect.objectContaining({ status: ReconItemStatus.MISSING_IN_SYSTEM })]);

      const final = await useCases.final.execute('WU', [branchA.id, branchB.id], admin);

      expect(final).toEqual(expect.objectContaining({ matchedCount: 1, totalCount: 1, matchRate: 1 }));
      expect(repo.runs.get(final.id).result.items).toEqual([
        expect.objectContaining({
          status: ReconItemStatus.MATCHED,
          transactionId: 'tx-cross-branch',
          branchId: BRANCH_A,
        }),
      ]);
      expect(repo.transactions.get('tx-cross-branch')?.debtStatus).toBe('RECONCILED');
    });

    it('không khớp nếu Final chỉ chọn chi nhánh upload Journal sai', async () => {
      const repo = new MultiBranchWorkflowRepository();
      repo.createTransaction({
        id: 'tx-not-selected', code: '5555555555', branchId: BRANCH_A,
        amount: 500, businessDate: BUSINESS_DATE,
      });
      const useCases = createUseCases(repo);
      const branchB = await runBranch(useCases.branch, BRANCH_B, [
        { code: '5555555555', amount: 500 },
      ]);

      const final = await useCases.final.execute('WU', [branchB.id], admin);

      expect(final).toEqual(expect.objectContaining({ matchedCount: 0, totalCount: 1 }));
      expect(repo.runs.get(final.id).result.items)
        .toEqual([expect.objectContaining({ status: ReconItemStatus.MISSING_IN_SYSTEM })]);
      expect(repo.transactions.get('tx-not-selected')?.debtStatus).toBe('PENDING');
    });

    it('giữ debt PENDING khi mã khớp xuyên chi nhánh nhưng số tiền lệch', async () => {
      const repo = new MultiBranchWorkflowRepository();
      repo.createTransaction({
        id: 'tx-cross-variance', code: '6666666666', branchId: BRANCH_A,
        amount: 600, businessDate: BUSINESS_DATE,
      });
      const useCases = createUseCases(repo);
      const branchA = await runBranch(useCases.branch, BRANCH_A, []);
      const branchB = await runBranch(useCases.branch, BRANCH_B, [
        { code: '6666666666', amount: 650 },
      ]);

      const final = await useCases.final.execute('WU', [branchA.id, branchB.id], admin);

      expect(final).toEqual(expect.objectContaining({ matchedCount: 0, totalCount: 1 }));
      expect(repo.runs.get(final.id).result.items).toEqual([
        expect.objectContaining({
          status: ReconItemStatus.AMOUNT_VARIANCE,
          transactionId: 'tx-cross-variance',
          branchId: BRANCH_A,
          systemAmount: 600,
          journalAmount: 650,
        }),
      ]);
      expect(repo.transactions.get('tx-cross-variance')?.debtStatus).toBe('PENDING');
    });
  });
});
