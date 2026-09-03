import { BadRequestException, ForbiddenException } from '@nestjs/common';
import { RunReconciliationUseCase, ListReconciliationUseCase, CreateProviderFinalRunUseCase } from './reconciliation.use-cases';
import { UserRole } from '../../../domain/entities/user.entity';

const BRANCH_A = '00000000-0000-0000-0000-000000000001';
const BRANCH_B = '00000000-0000-0000-0000-000000000002';
const admin = { id: 'admin', role: UserRole.ADMIN, branchId: null };
const staffA = { id: 'staff-a', role: UserRole.STAFF, branchId: BRANCH_A };

function makeRepo() {
  return {
    listSystemTxByProvider: jest.fn().mockResolvedValue([]),
    saveRun: jest.fn().mockImplementation(async (input) => ({ id: 'run-1', ...input })),
    listRuns: jest.fn().mockResolvedValue([]),
    findRun: jest.fn(),
    getItems: jest.fn().mockResolvedValue([]),
    fundReconciliation: jest.fn(),
    getBranchRunsForFinal: jest.fn(),
    listSubmittedBranchRuns: jest.fn().mockResolvedValue([]),
  };
}

describe('RunReconciliationUseCase', () => {
  it('rejects duplicate journal references before reading or writing financial data', async () => {
    const repo = makeRepo();
    const useCase = new RunReconciliationUseCase(repo as any);

    await expect(useCase.execute({
      provider: 'MG',
      businessDate: '2026-08-01',
      rows: [
        { code: 'ab12cd34', amount: 100, currencyCode: 'USD', branchId: BRANCH_A },
        { code: 'AB12CD34', amount: 100, currencyCode: 'USD', branchId: BRANCH_A },
      ],
    }, staffA)).rejects.toBeInstanceOf(BadRequestException);
    expect(repo.listSystemTxByProvider).not.toHaveBeenCalled();
    expect(repo.saveRun).not.toHaveBeenCalled();
  });

  it('STAFF luôn bị ép về chi nhánh của mình (kể cả MG) và không được chọn chi nhánh khác', async () => {
    const repo = makeRepo();
    const useCase = new RunReconciliationUseCase(repo as any);

    await useCase.execute({
      provider: 'MG', businessDate: '2026-08-01',
      rows: [{ code: 'AB12CD34', amount: 100, currencyCode: 'USD' }],
    }, staffA);
    expect(repo.listSystemTxByProvider).toHaveBeenCalledWith('MG', expect.any(Date), BRANCH_A);
    expect(repo.saveRun).toHaveBeenCalledWith(expect.objectContaining({
      provider: 'MG', scope: 'BRANCH', branchId: BRANCH_A,
      stage: 'BRANCH', postFinancial: false, submitForFinal: true,
    }));

    await expect(useCase.execute({
      provider: 'WU', businessDate: '2026-08-01', branchId: BRANCH_B,
      rows: [{ code: '1234567890', amount: 100, currencyCode: 'USD' }],
    }, staffA)).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('GĐ/KTTH không chạy MG trực tiếp, phải chọn bản chi nhánh', async () => {
    const useCase = new RunReconciliationUseCase(makeRepo() as any);
    await expect(useCase.execute({
      provider: 'MG', businessDate: '2026-08-01', branchId: BRANCH_A,
      rows: [{ code: 'AB12CD34', amount: 100, currencyCode: 'USD' }],
    }, admin)).rejects.toBeInstanceOf(BadRequestException);
  });

  it('STAFF tạo WU thành bản BRANCH và chưa ghi tài chính', async () => {
    const repo = makeRepo();
    const useCase = new RunReconciliationUseCase(repo as any);
    await useCase.execute({
      provider: 'WU', businessDate: '2026-08-01',
      rows: [{ code: '1234567890', amount: 100, currencyCode: 'USD' }],
    }, staffA);
    expect(repo.saveRun).toHaveBeenCalledWith(expect.objectContaining({
      provider: 'WU', stage: 'BRANCH', postFinancial: false, submitForFinal: true, branchId: BRANCH_A,
    }));
  });

  it('chuẩn hóa MTCN có dấu gạch trước khi đối chiếu', async () => {
    const repo = makeRepo();
    const useCase = new RunReconciliationUseCase(repo as any);
    await useCase.execute({
      provider: 'WU', businessDate: '2026-08-01',
      rows: [{ code: '633-775-1692', amount: 100, currencyCode: 'USD' }],
    }, staffA);

    expect(repo.saveRun).toHaveBeenCalledWith(expect.objectContaining({
      result: expect.objectContaining({
        items: expect.arrayContaining([expect.objectContaining({ code: '6337751692' })]),
      }),
    }));
  });

  it('GĐ/KTTH không chạy WU trực tiếp, phải chọn bản chi nhánh', async () => {
    const useCase = new RunReconciliationUseCase(makeRepo() as any);
    await expect(useCase.execute({
      provider: 'WU', businessDate: '2026-08-01', branchId: BRANCH_A,
      rows: [{ code: '1234567890', amount: 100, currencyCode: 'USD' }],
    }, admin)).rejects.toBeInstanceOf(BadRequestException);
  });
});

describe('CreateProviderFinalRunUseCase', () => {
  function branchRun(id: string, branchId: string, provider: 'WU' | 'MG', businessDate: Date, code: string, amount = 100) {
    return {
      summary: {
        id, runNo: `RC-${id}`, provider, scope: 'BRANCH', branchId,
        branchCode: branchId === BRANCH_A ? 'A' : 'B', currencyCode: 'USD', businessDate,
        status: 'MATCHED', stage: 'BRANCH', systemTotal: amount, journalTotal: amount,
        varianceTotal: 0, matchRate: 1, matchedCount: 1, totalCount: 1,
        createdAt: businessDate, submittedAt: businessDate,
      },
      rows: [{ code, amount, currencyCode: 'USD', branchId }],
    };
  }

  it.each(['WU', 'MG'] as const)('tạo bản FINAL %s từ các bản chi nhánh đã gửi và chỉ post khi khớp', async (provider) => {
    const repo = makeRepo();
    const businessDate = new Date('2026-08-01T00:00:00.000Z');
    const source = branchRun('run-a', BRANCH_A, provider, businessDate, provider === 'WU' ? '1234567890' : 'AB12CD34');
    repo.getBranchRunsForFinal.mockResolvedValue([source]);
    repo.listSubmittedBranchRuns.mockResolvedValue([source.summary]);
    repo.listSystemTxByProvider.mockResolvedValue([
      { code: source.rows[0].code, amount: 100, currencyCode: 'USD', branchId: BRANCH_A, transactionId: 'tx-1' },
    ]);
    const useCase = new CreateProviderFinalRunUseCase(repo as any);
    await useCase.execute(provider, ['run-a'], admin);
    expect(repo.saveRun).toHaveBeenCalledWith(expect.objectContaining({
      provider, stage: 'FINAL', postFinancial: true, sourceRunIds: ['run-a'], scope: 'COMPANY',
    }));
  });

  it('rejects a final run when another branch run in the same group is omitted', async () => {
    const repo = makeRepo();
    const businessDate = new Date('2026-08-01T00:00:00.000Z');
    const runA = branchRun('run-a', BRANCH_A, 'WU', businessDate, '1234567890');
    const runB = branchRun('run-b', BRANCH_B, 'WU', businessDate, '0987654321');
    repo.getBranchRunsForFinal.mockResolvedValue([runA]);
    repo.listSubmittedBranchRuns.mockResolvedValue([runA.summary, runB.summary]);

    const useCase = new CreateProviderFinalRunUseCase(repo as any);
    await expect(useCase.execute('WU', ['run-a'], admin)).rejects.toBeInstanceOf(BadRequestException);
    expect(repo.saveRun).not.toHaveBeenCalled();
  });

  it('consumes source branch runs even when Final has discrepancies so the branch must submit a new run', async () => {
    const repo = makeRepo();
    const businessDate = new Date('2026-08-01T00:00:00.000Z');
    const source = branchRun('run-a', BRANCH_A, 'WU', businessDate, '1234567890', 100);
    repo.getBranchRunsForFinal.mockResolvedValue([source]);
    repo.listSubmittedBranchRuns.mockResolvedValue([source.summary]);
    repo.listSystemTxByProvider.mockResolvedValue([
      { code: '1234567890', amount: 120, currencyCode: 'USD', branchId: BRANCH_A, transactionId: 'tx-1' },
    ]);

    const useCase = new CreateProviderFinalRunUseCase(repo as any);
    await useCase.execute('WU', ['run-a'], admin);
    expect(repo.saveRun).toHaveBeenCalledWith(expect.objectContaining({
      stage: 'FINAL', postFinancial: false, sourceRunIds: ['run-a'],
    }));
  });

  it('rejects final reconciliation until every branch with system transactions has submitted', async () => {
    const repo = makeRepo();
    const businessDate = new Date('2026-08-01T00:00:00.000Z');
    const source = branchRun('run-a', BRANCH_A, 'WU', businessDate, '1234567890');
    repo.getBranchRunsForFinal.mockResolvedValue([source]);
    repo.listSubmittedBranchRuns.mockResolvedValue([source.summary]);
    repo.listSystemTxByProvider.mockResolvedValue([
      { code: '1234567890', amount: 100, currencyCode: 'USD', branchId: BRANCH_A, transactionId: 'tx-1' },
      { code: '0987654321', amount: 50, currencyCode: 'USD', branchId: BRANCH_B, transactionId: 'tx-2' },
    ]);

    const useCase = new CreateProviderFinalRunUseCase(repo as any);
    await expect(useCase.execute('WU', ['run-a'], admin)).rejects.toBeInstanceOf(BadRequestException);
    expect(repo.saveRun).not.toHaveBeenCalled();
  });
});

describe('ListReconciliationUseCase', () => {
  it('STAFF chỉ xem lịch sử/chi tiết của chi nhánh mình; GĐ lọc tùy ý', async () => {
    const repo = makeRepo();
    const useCase = new ListReconciliationUseCase(repo as any);

    await useCase.runs(staffA, undefined);
    expect(repo.listRuns).toHaveBeenLastCalledWith(BRANCH_A, undefined);
    await useCase.runs(admin, BRANCH_B);
    expect(repo.listRuns).toHaveBeenLastCalledWith(BRANCH_B, undefined);
    await useCase.runs(admin, undefined);
    expect(repo.listRuns).toHaveBeenLastCalledWith(undefined, undefined);

    repo.findRun.mockResolvedValue({ id: 'run-1', branchId: BRANCH_B });
    await expect(useCase.items(staffA, 'run-1')).rejects.toBeInstanceOf(ForbiddenException);
    await useCase.items(admin, 'run-1');
    expect(repo.getItems).toHaveBeenCalledWith('run-1');
  });
});
