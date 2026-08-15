import { BadRequestException, ForbiddenException } from '@nestjs/common';
import { RunReconciliationUseCase, ListReconciliationUseCase } from './reconciliation.use-cases';
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
    }, admin)).rejects.toBeInstanceOf(BadRequestException);
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
    expect(repo.saveRun).toHaveBeenCalledWith(expect.objectContaining({ scope: 'BRANCH', branchId: BRANCH_A }));

    await expect(useCase.execute({
      provider: 'WU', businessDate: '2026-08-01', branchId: BRANCH_B,
      rows: [{ code: '1234567890', amount: 100, currencyCode: 'USD' }],
    }, staffA)).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('GĐ/KTTH chạy MG toàn công ty khi không chọn chi nhánh, riêng chi nhánh khi có chọn', async () => {
    const repo = makeRepo();
    const useCase = new RunReconciliationUseCase(repo as any);
    await useCase.execute({
      provider: 'MG', businessDate: '2026-08-01',
      rows: [{ code: 'AB12CD34', amount: 100, currencyCode: 'USD', branchId: BRANCH_A }],
    }, admin);
    expect(repo.saveRun).toHaveBeenLastCalledWith(expect.objectContaining({ scope: 'COMPANY', branchId: undefined }));

    await useCase.execute({
      provider: 'MG', businessDate: '2026-08-01', branchId: BRANCH_B,
      rows: [{ code: 'AB12CD35', amount: 100, currencyCode: 'USD' }],
    }, admin);
    expect(repo.saveRun).toHaveBeenLastCalledWith(expect.objectContaining({ scope: 'BRANCH', branchId: BRANCH_B }));
  });
});

describe('ListReconciliationUseCase', () => {
  it('STAFF chỉ xem lịch sử/chi tiết của chi nhánh mình; GĐ lọc tùy ý', async () => {
    const repo = makeRepo();
    const useCase = new ListReconciliationUseCase(repo as any);

    await useCase.runs(staffA, undefined);
    expect(repo.listRuns).toHaveBeenLastCalledWith(BRANCH_A);
    await useCase.runs(admin, BRANCH_B);
    expect(repo.listRuns).toHaveBeenLastCalledWith(BRANCH_B);
    await useCase.runs(admin, undefined);
    expect(repo.listRuns).toHaveBeenLastCalledWith(undefined);

    repo.findRun.mockResolvedValue({ id: 'run-1', branchId: BRANCH_B });
    await expect(useCase.items(staffA, 'run-1')).rejects.toBeInstanceOf(ForbiddenException);
    await useCase.items(admin, 'run-1');
    expect(repo.getItems).toHaveBeenCalledWith('run-1');
  });
});
