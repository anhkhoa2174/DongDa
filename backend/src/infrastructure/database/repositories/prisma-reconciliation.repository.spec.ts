import { PrismaReconciliationRepository } from './prisma-reconciliation.repository';

function count(overrides: Record<string, unknown> = {}) {
  return {
    id: 'count-new',
    branch_id: 'branch-1',
    shift_id: 'shift-1',
    business_date: new Date('2026-09-15T00:00:00.000Z'),
    counted_at: new Date('2026-09-15T03:00:00.000Z'),
    note: 'Kiểm quỹ trong ca',
    branches: { code: 'NCT', name: 'Nguyễn Chí Thanh' },
    shifts: { shift_code: 'SH-NCT-1' },
    users_cash_counts_counted_by_user_idTousers: {
      username: 'staff.nct',
      employees: { full_name: 'Nguyễn Văn A' },
    },
    cash_count_lines: [{
      currency_code: 'VND',
      system_amount: 1_000_000,
      actual_amount: 999_000,
      variance: -1_000,
    }],
    ...overrides,
  };
}

describe('PrismaReconciliationRepository fund reconciliation', () => {
  it('returns every posted opening and closing sheet, excluding in-shift counts', async () => {
    const prisma = {
      cash_counts: {
        findMany: jest.fn().mockResolvedValue([
          count({
            id: 'count-opening',
            counted_at: new Date('2026-09-15T01:00:00.000Z'),
            shifts: { shift_code: 'SH-NCT-1', status: 'CLOSED' },
            cash_count_lines: [{
              currency_code: 'EUR', system_amount: 100, actual_amount: 100, variance: 0,
            }],
          }),
          count({
            id: 'count-in-shift',
            counted_at: new Date('2026-09-15T02:00:00.000Z'),
            shifts: { shift_code: 'SH-NCT-1', status: 'CLOSED' },
          }),
          count({
            id: 'count-closing',
            counted_at: new Date('2026-09-15T03:00:00.000Z'),
            shifts: { shift_code: 'SH-NCT-1', status: 'CLOSED' },
          }),
        ]),
      },
    };
    const repository = new PrismaReconciliationRepository(prisma as any, {} as any);

    const result = await repository.fundReconciliation();

    expect(prisma.cash_counts.findMany).toHaveBeenCalledWith(expect.objectContaining({
      where: { status: 'POSTED' },
    }));
    expect(result).toHaveLength(2);
    expect(result[0]).toEqual(expect.objectContaining({
      id: 'count-closing',
      countType: 'CLOSING',
      branchCode: 'NCT',
      status: 'VARIANCE',
      matchedCount: 0,
      varianceCount: 1,
      lines: [{
        currencyCode: 'VND',
        systemBalance: 1_000_000,
        physicalActual: 999_000,
        variance: -1_000,
        status: 'SHORTAGE',
      }],
    }));
    expect(result[1]).toEqual(expect.objectContaining({
      id: 'count-opening',
      countType: 'OPENING',
      status: 'MATCH',
      lines: [expect.objectContaining({ currencyCode: 'EUR' })],
    }));
    expect(result.map((sheet) => sheet.id)).not.toContain('count-in-shift');
  });
});

describe('PrismaReconciliationRepository.saveRun — nhiều vòng Final cùng ngày', () => {
  function saveRunInput(overrides: Partial<import('../../../domain/repositories/reconciliation.repository').SaveRunInput> = {}) {
    return {
      provider: 'WU',
      businessDate: new Date('2026-09-16T00:00:00.000Z'),
      dateFrom: new Date('2026-09-16T00:00:00.000Z'),
      dateTo: new Date('2026-09-16T00:00:00.000Z'),
      scope: 'COMPANY' as const,
      currencyCode: 'USD' as const,
      result: {
        items: [], systemTotal: 0, journalTotal: 0, varianceTotal: 0, totalCount: 0, matchedCount: 0, matchRate: 1,
      },
      createdByUserId: 'admin-1',
      stage: 'FINAL' as const,
      postFinancial: true,
      sourceRunIds: ['branch-run-1'],
      ...overrides,
    };
  }

  it('cho phép Final mới sau Final khớp một phần để xử lý các dòng chi nhánh đã sửa', async () => {
    const tx = {
      $executeRaw: jest.fn().mockResolvedValue(undefined),
      reconciliation_runs: {
        findFirst: jest.fn(),
        count: jest.fn().mockResolvedValue(1),
        create: jest.fn().mockResolvedValue({ id: 'run-new', run_no: 'RC-2' }),
        updateMany: jest.fn().mockResolvedValue({ count: 1 }),
      },
      reconciliation_final_sources: { createMany: jest.fn().mockResolvedValue({ count: 1 }) },
      journal_upload_files: { create: jest.fn().mockResolvedValue({ id: 'file-1' }) },
      journal_batches: { create: jest.fn().mockResolvedValue({ id: 'batch-1' }) },
      debt_accounts: { findMany: jest.fn().mockResolvedValue([]) },
    };
    const prisma = { $transaction: jest.fn((cb: any) => cb(tx)) };
    const notifications = { notifyUsers: jest.fn().mockResolvedValue(undefined) };
    const repository = new PrismaReconciliationRepository(prisma as any, notifications as any);

    const result = await repository.saveRun(saveRunInput());

    expect(result.id).toBe('run-new');
    expect(tx.reconciliation_runs.findFirst).not.toHaveBeenCalled();
    expect(tx.reconciliation_runs.create).toHaveBeenCalledTimes(1);
  });

  it('cho phép chi nhánh gửi branch run mới cùng ngày sau khi Final cũ đã hoàn tất', async () => {
    const tx = {
      $executeRaw: jest.fn().mockResolvedValue(undefined),
      reconciliation_runs: {
        findFirst: jest.fn().mockResolvedValue(null),
        create: jest.fn().mockResolvedValue({ id: 'branch-run-2', run_no: 'RC-BRANCH-2' }),
      },
      journal_upload_files: { create: jest.fn().mockResolvedValue({ id: 'file-2' }) },
      journal_batches: { create: jest.fn().mockResolvedValue({ id: 'batch-2' }) },
    };
    const prisma = { $transaction: jest.fn((cb: any) => cb(tx)) };
    const notifications = { notifyUsers: jest.fn().mockResolvedValue(undefined) };
    const repository = new PrismaReconciliationRepository(prisma as any, notifications as any);

    const result = await repository.saveRun(saveRunInput({
      scope: 'BRANCH',
      branchId: 'branch-1',
      stage: 'BRANCH',
      postFinancial: false,
      submitForFinal: true,
      sourceRunIds: undefined,
    }));

    expect(result.id).toBe('branch-run-2');
    expect(tx.reconciliation_runs.findFirst).toHaveBeenCalledTimes(1);
    expect(tx.reconciliation_runs.findFirst).toHaveBeenCalledWith(expect.objectContaining({
      where: expect.objectContaining({
        branch_id: 'branch-1',
        submitted_at: { not: null },
        final_targets: { none: {} },
      }),
    }));
  });

  it('từ chối dùng lại branch run đã thuộc một Final trước đó', async () => {
    const tx = {
      $executeRaw: jest.fn().mockResolvedValue(undefined),
      reconciliation_runs: {
        count: jest.fn().mockResolvedValue(0),
        create: jest.fn(),
      },
    };
    const prisma = { $transaction: jest.fn((cb: any) => cb(tx)) };
    const repository = new PrismaReconciliationRepository(prisma as any, {} as any);

    await expect(repository.saveRun(saveRunInput()))
      .rejects.toThrow('Có bản chi nhánh đã được một lần đối chiếu Final khác sử dụng');
    expect(tx.reconciliation_runs.create).not.toHaveBeenCalled();
  });

  it('không chuyển công nợ khi loại tiền khác với dòng Final đã khớp', async () => {
    const tx = {
      $executeRaw: jest.fn().mockResolvedValue(undefined),
      debt_accounts: {
        findMany: jest.fn()
          .mockResolvedValueOnce([{ id: 'debt-1' }])
          .mockResolvedValueOnce([{
            id: 'debt-1', transaction_id: 'tx-1', lifecycle_status: 'PENDING', currency_code: 'VND',
          }]),
        updateMany: jest.fn(),
      },
    };
    const repository = new PrismaReconciliationRepository({} as any, {} as any);

    await expect((repository as any).postActualDebt(tx, 'run-1', [{
      status: 'MATCHED', code: '1234567890', transactionId: 'tx-1', branchId: 'branch-1',
      systemAmount: 100, journalAmount: 100, varianceAmount: 0, currencyCode: 'USD',
    }], new Date())).rejects.toThrow('Loại tiền công nợ giao dịch tx-1 không khớp bản đối chiếu');

    expect(tx.debt_accounts.updateMany).not.toHaveBeenCalled();
  });

  it('chỉ chuyển debt PENDING của dòng khớp và giữ nguyên debt đã RECONCILED', async () => {
    const updateMany = jest.fn().mockResolvedValue({ count: 1 });
    const tx = {
      $executeRaw: jest.fn().mockResolvedValue(undefined),
      debt_accounts: {
        findMany: jest.fn()
          .mockResolvedValueOnce([{ id: 'debt-old' }, { id: 'debt-new' }])
          .mockResolvedValueOnce([
            { id: 'debt-old', transaction_id: 'tx-old', lifecycle_status: 'RECONCILED', currency_code: 'USD' },
            { id: 'debt-new', transaction_id: 'tx-new', lifecycle_status: 'PENDING', currency_code: 'USD' },
          ]),
        updateMany,
      },
    };
    const repository = new PrismaReconciliationRepository({} as any, {} as any);

    const count = await (repository as any).postActualDebt(tx, 'final-run-2', [
      {
        status: 'MATCHED', code: '1111111111', transactionId: 'tx-old', branchId: 'branch-1',
        systemAmount: 100, journalAmount: 100, varianceAmount: 0, currencyCode: 'USD',
      },
      {
        status: 'MATCHED', code: '2222222222', transactionId: 'tx-new', branchId: 'branch-1',
        systemAmount: 200, journalAmount: 200, varianceAmount: 0, currencyCode: 'USD',
      },
    ], new Date());

    expect(count).toBe(1);
    expect(updateMany).toHaveBeenCalledWith(expect.objectContaining({
      where: { id: { in: ['debt-new'] }, lifecycle_status: 'PENDING' },
      data: expect.objectContaining({ lifecycle_status: 'RECONCILED', reconciliation_run_id: 'final-run-2' }),
    }));
  });

  it('Final vẫn chốt bình thường khi ngày+loại tiền đó chưa từng được chốt', async () => {
    const tx = {
      $executeRaw: jest.fn().mockResolvedValue(undefined),
      reconciliation_runs: {
        findFirst: jest.fn().mockResolvedValue(null),
        count: jest.fn().mockResolvedValue(1),
        create: jest.fn().mockResolvedValue({ id: 'run-new', run_no: 'RC-1' }),
        updateMany: jest.fn().mockResolvedValue({ count: 1 }),
      },
      reconciliation_final_sources: { createMany: jest.fn().mockResolvedValue({ count: 1 }) },
      journal_upload_files: { create: jest.fn().mockResolvedValue({ id: 'file-1' }) },
      journal_batches: { create: jest.fn().mockResolvedValue({ id: 'batch-1' }) },
      journal_rows: { create: jest.fn().mockResolvedValue({ id: 'row-1' }) },
      debt_accounts: { findMany: jest.fn().mockResolvedValue([]) },
    };
    const prisma = { $transaction: jest.fn((cb: any) => cb(tx)) };
    const notifications = { notifyUsers: jest.fn().mockResolvedValue(undefined) };
    const repository = new PrismaReconciliationRepository(prisma as any, notifications as any);

    const result = await repository.saveRun(saveRunInput());

    expect(result.id).toBe('run-new');
    expect(tx.reconciliation_runs.create).toHaveBeenCalledTimes(1);
  });
});
