import { BadRequestException, NotFoundException } from '@nestjs/common';
import { PrismaDebtRepository } from './prisma-debt.repository';

function makeTx(lifecycleStatus: string | null, transactionId: string | null = 'tx-1') {
  return {
    $executeRaw: jest.fn().mockResolvedValue(1),
    debt_accounts: {
      findUnique: jest.fn()
        .mockResolvedValueOnce(lifecycleStatus === null ? null : { transaction_id: transactionId })
        .mockResolvedValueOnce(lifecycleStatus === null ? null : { lifecycle_status: lifecycleStatus }),
      update: jest.fn().mockResolvedValue({}),
    },
    audit_logs: { create: jest.fn().mockResolvedValue({}) },
  };
}

function makeRepository(tx: ReturnType<typeof makeTx>) {
  const prisma = { $transaction: jest.fn((cb: any) => cb(tx)) };
  const repository = new PrismaDebtRepository(prisma as any, {} as any);
  jest.spyOn(repository, 'getAccountSummary').mockResolvedValue({ id: 'debt-1', status: 'RECONCILED' } as any);
  return repository;
}

describe('PrismaDebtRepository.approvePending — duyệt tay công nợ không đối chiếu được', () => {
  it('chuyển PENDING sang RECONCILED và ghi audit kèm lý do', async () => {
    const tx = makeTx('PENDING');
    const repository = makeRepository(tx);

    const result = await repository.approvePending({
      debtAccountId: 'debt-1', reason: 'Journal WU thiếu dòng, đã xác nhận với WU', approvedByUserId: 'mgr-1',
    });

    expect(tx.debt_accounts.update).toHaveBeenCalledWith({
      where: { id: 'debt-1' },
      data: expect.objectContaining({ lifecycle_status: 'RECONCILED', reconciled_at: expect.any(Date) }),
    });
    expect(tx.audit_logs.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        user_id: 'mgr-1',
        action: 'MANUAL_APPROVE_DEBT',
        entity_type: 'DEBT_ACCOUNT',
        entity_id: 'debt-1',
        before_data: { lifecycleStatus: 'PENDING' },
        after_data: { lifecycleStatus: 'RECONCILED', reason: 'Journal WU thiếu dòng, đã xác nhận với WU' },
      }),
    });
    expect(result.status).toBe('RECONCILED');
  });

  it('khoá giao dịch trước rồi mới khoá công nợ (cùng thứ tự với đối chiếu, tránh deadlock)', async () => {
    const tx = makeTx('PENDING', 'tx-1');
    const repository = makeRepository(tx);

    await repository.approvePending({ debtAccountId: 'debt-1', reason: 'ok', approvedByUserId: 'mgr-1' });

    const lockedTables = tx.$executeRaw.mock.calls.map((call: any[]) => call[0].join('?'));
    expect(lockedTables[0]).toContain('customer_transactions');
    expect(lockedTables[1]).toContain('debt_accounts');
  });

  it.each(['RECONCILED', 'SETTLED', 'CANCELLED'])('từ chối duyệt công nợ đang ở %s', async (status) => {
    const tx = makeTx(status);
    const repository = makeRepository(tx);

    await expect(repository.approvePending({ debtAccountId: 'debt-1', reason: 'ok', approvedByUserId: 'mgr-1' }))
      .rejects.toThrow(BadRequestException);
    expect(tx.debt_accounts.update).not.toHaveBeenCalled();
    expect(tx.audit_logs.create).not.toHaveBeenCalled();
  });

  it('công nợ không gắn giao dịch: bỏ qua khoá customer_transactions, vẫn khoá công nợ', async () => {
    const tx = makeTx('PENDING', null);
    const repository = makeRepository(tx);

    await repository.approvePending({ debtAccountId: 'debt-1', reason: 'ok', approvedByUserId: 'mgr-1' });

    const lockedTables = tx.$executeRaw.mock.calls.map((call: any[]) => call[0].join('?'));
    expect(lockedTables).toHaveLength(1);
    expect(lockedTables[0]).toContain('debt_accounts');
    expect(tx.debt_accounts.update).toHaveBeenCalled();
  });

  it('đọc lại trạng thái SAU khi khoá (chống 2 người duyệt cùng lúc)', async () => {
    // Lần đọc trước khoá thấy PENDING, nhưng sau khi khoá thì người khác đã duyệt xong.
    const tx = makeTx('RECONCILED');
    const repository = makeRepository(tx);

    await expect(repository.approvePending({ debtAccountId: 'debt-1', reason: 'ok', approvedByUserId: 'mgr-2' }))
      .rejects.toThrow('Chỉ duyệt được công nợ đang ở trạng thái Chờ đối chiếu');
    const lockCallOrder = tx.$executeRaw.mock.invocationCallOrder;
    const statusReadOrder = tx.debt_accounts.findUnique.mock.invocationCallOrder[1];
    expect(Math.max(...lockCallOrder)).toBeLessThan(statusReadOrder);
  });

  it('ghi audit lỗi thì cả thao tác thất bại (không để đổi trạng thái mà thiếu nhật ký)', async () => {
    const tx = makeTx('PENDING');
    tx.audit_logs.create.mockRejectedValue(new Error('audit down'));
    const repository = makeRepository(tx);

    await expect(repository.approvePending({ debtAccountId: 'debt-1', reason: 'ok', approvedByUserId: 'mgr-1' }))
      .rejects.toThrow('audit down');
    expect(repository.getAccountSummary).not.toHaveBeenCalled();
  });

  it('cập nhật trạng thái và ghi audit trong cùng 1 transaction', async () => {
    const tx = makeTx('PENDING');
    const prisma = { $transaction: jest.fn((cb: any) => cb(tx)) };
    const repository = new PrismaDebtRepository(prisma as any, {} as any);
    jest.spyOn(repository, 'getAccountSummary').mockResolvedValue({ id: 'debt-1' } as any);

    await repository.approvePending({ debtAccountId: 'debt-1', reason: 'ok', approvedByUserId: 'mgr-1' });

    expect(prisma.$transaction).toHaveBeenCalledTimes(1);
    expect(tx.debt_accounts.update).toHaveBeenCalledTimes(1);
    expect(tx.audit_logs.create).toHaveBeenCalledTimes(1);
  });

  it('báo không tìm thấy nếu công nợ không tồn tại', async () => {
    const tx = makeTx(null);
    const repository = makeRepository(tx);

    await expect(repository.approvePending({ debtAccountId: 'missing', reason: 'ok', approvedByUserId: 'mgr-1' }))
      .rejects.toThrow(NotFoundException);
    expect(tx.debt_accounts.update).not.toHaveBeenCalled();
  });
});

describe('PrismaDebtRepository.listAccountSummaries — bộ lọc', () => {
  it('lọc theo ngân hàng, trạng thái, chi nhánh, provider, tiền tệ và khoảng ngày', async () => {
    const findMany = jest.fn().mockResolvedValue([]);
    const repository = new PrismaDebtRepository({ debt_accounts: { findMany } } as any, {} as any);

    await repository.listAccountSummaries({
      branchId: '00000000-0000-0000-0000-000000000001',
      bankAccountId: '00000000-0000-0000-0000-000000000002',
      providerCode: 'WU',
      currencyCode: 'USD',
      status: 'RECONCILED' as any,
      dateFrom: new Date('2026-09-01T00:00:00.000Z'),
      dateTo: new Date('2026-09-30T00:00:00.000Z'),
    });

    expect(findMany).toHaveBeenCalledWith(expect.objectContaining({
      where: {
        branch_id: '00000000-0000-0000-0000-000000000001',
        provider_code: 'WU',
        currency_code: 'USD',
        lifecycle_status: 'RECONCILED',
        transaction: {
          wu_transaction_details: { bank_account_id: '00000000-0000-0000-0000-000000000002' },
        },
        business_date: {
          gte: new Date('2026-09-01T00:00:00.000Z'),
          lte: new Date('2026-09-30T00:00:00.000Z'),
        },
      },
    }));
  });
});
