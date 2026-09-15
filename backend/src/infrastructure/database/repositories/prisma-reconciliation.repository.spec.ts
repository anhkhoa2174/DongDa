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
