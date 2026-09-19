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

describe('PrismaReconciliationRepository.saveRun — chặn chốt Final trùng ngày đã chốt', () => {
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

  it('báo lỗi rõ ràng thay vì crash khi Final trúng ngày+loại tiền đã được chốt rồi (dù status vẫn PENDING_REVIEW)', async () => {
    const alreadyPosted = {
      id: 'run-existing', posted_at: new Date('2026-09-16T10:41:39.000Z'), status: 'PENDING_REVIEW',
    };
    const tx = {
      $executeRaw: jest.fn().mockResolvedValue(undefined),
      reconciliation_runs: {
        findFirst: jest.fn().mockResolvedValue(alreadyPosted),
        create: jest.fn(),
      },
    };
    const prisma = { $transaction: jest.fn((cb: any) => cb(tx)) };
    const repository = new PrismaReconciliationRepository(prisma as any, {} as any);

    await expect(repository.saveRun(saveRunInput())).rejects.toThrow(
      'Ngày này đã được đối chiếu Final và chốt công nợ rồi, không thể chốt lại.',
    );

    // Phần cốt lõi của regression test: phải phát hiện TRƯỚC khi insert, không được
    // đâm thẳng vào create() rồi để Postgres tự chặn bằng lỗi 500 thô.
    expect(tx.reconciliation_runs.create).not.toHaveBeenCalled();
    // Query kiểm tra phải khớp đúng cột của unique index — business_date (không phải
    // period_from/period_to như nhánh BRANCH) — và KHÔNG lọc status: 'MATCHED', vì dữ
    // liệu thật cho thấy Final có thể posted_at != null trong lúc status vẫn PENDING_REVIEW.
    expect(tx.reconciliation_runs.findFirst).toHaveBeenCalledWith(expect.objectContaining({
      where: expect.objectContaining({
        business_date: new Date('2026-09-16T00:00:00.000Z'),
        currency_code: 'USD',
        posted_at: { not: null },
      }),
    }));
    const calledWhere = tx.reconciliation_runs.findFirst.mock.calls[0][0].where;
    expect(calledWhere).not.toHaveProperty('status');
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
