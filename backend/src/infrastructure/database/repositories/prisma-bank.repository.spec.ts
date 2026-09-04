import { BadRequestException } from '@nestjs/common';
import { PrismaBankRepository } from './prisma-bank.repository';

describe('PrismaBankRepository financial locking', () => {
  it('locks and checks the latest balance in the same transaction before deactivation', async () => {
    const tx = {
      $queryRaw: jest.fn().mockResolvedValue([]),
      bank_accounts: {
        findUnique: jest.fn().mockResolvedValue({
          id: 'bank-1',
          status: 'ACTIVE',
          current_balance: 100,
          available_balance: 100,
        }),
        update: jest.fn(),
      },
    };
    const prisma = {
      $transaction: jest.fn((callback: (client: typeof tx) => unknown) => callback(tx)),
    };
    const repository = new PrismaBankRepository(prisma as any, {} as any);

    await expect(repository.deactivateAccount('bank-1')).rejects.toBeInstanceOf(BadRequestException);
    expect(tx.$queryRaw).toHaveBeenCalledTimes(1);
    expect(tx.bank_accounts.findUnique).toHaveBeenCalledWith({ where: { id: 'bank-1' } });
    expect(tx.bank_accounts.update).not.toHaveBeenCalled();
  });

  it('separates voided advances from pending advances', async () => {
    const advance = {
      id: 'advance-1',
      movement_no: 'DT-BM-001',
      bank_account_id: 'bank-1',
      branch_id: 'branch-1',
      movement_type: 'ADVANCE_CK',
      business_date: new Date('2026-09-02'),
      amount: 1_500_000,
      currency_code: 'VND',
      balance_before: 0,
      balance_after: -1_500_000,
      bank_reference: 'DOMESTIC:00000000-0000-0000-0000-000000000001',
      description: 'Phiếu ứng',
      status: 'POSTED',
      created_by_user_id: 'user-1',
      created_at: new Date('2026-09-02T10:00:00Z'),
    };
    const prisma = {
      bank_balance_movements: {
        findMany: jest.fn()
          .mockResolvedValueOnce([advance])
          .mockResolvedValueOnce([])
          .mockResolvedValueOnce([advance])
          .mockResolvedValueOnce([]),
      },
      customer_transactions: {
        findMany: jest.fn()
          .mockResolvedValueOnce([{
            id: '00000000-0000-0000-0000-000000000001',
            voided_at: new Date('2026-09-02T11:00:00Z'),
            void_reason: 'Sai số tiền',
          }])
          .mockResolvedValueOnce([{
            id: '00000000-0000-0000-0000-000000000001',
            voided_at: new Date('2026-09-02T11:00:00Z'),
            void_reason: 'Sai số tiền',
          }]),
      },
    };
    const repository = new PrismaBankRepository(prisma as any, {} as any);

    await expect(repository.listAdvances({ status: 'ADVANCE_CK' })).resolves.toEqual([]);
    await expect(repository.listAdvances({ status: 'VOIDED' })).resolves.toEqual([
      expect.objectContaining({
        id: 'advance-1',
        settled: false,
        voided: true,
        voidReason: 'Sai số tiền',
      }),
    ]);
  });

  it('settles one advance while the target account remains negative from other advances', async () => {
    const advance = {
      id: '00000000-0000-0000-0000-000000000010',
      movement_no: 'ADVANCE-001',
      bank_account_id: '00000000-0000-0000-0000-000000000020',
      branch_id: '00000000-0000-0000-0000-000000000030',
      movement_type: 'ADVANCE_CK',
      amount: 1_500_000,
      bank_reference: 'DOMESTIC:00000000-0000-0000-0000-000000000040',
    };
    const target = {
      id: advance.bank_account_id,
      account_no: 'TARGET',
      branch_id: advance.branch_id,
      currency_code: 'VND',
      current_balance: -3_000_000,
      status: 'ACTIVE',
    };
    const source = {
      id: '00000000-0000-0000-0000-000000000050',
      account_no: 'SOURCE',
      branch_id: advance.branch_id,
      currency_code: 'VND',
      current_balance: 10_000_000,
      status: 'ACTIVE',
    };
    const settledMovement = {
      id: '00000000-0000-0000-0000-000000000060',
      movement_no: 'ADVANCE-SETTLE-001',
      bank_account_id: target.id,
      branch_id: advance.branch_id,
      movement_type: 'ADVANCE_SETTLE',
      business_date: new Date('2026-09-03'),
      amount: advance.amount,
      currency_code: 'VND',
      balance_before: -3_000_000,
      balance_after: -1_500_000,
      bank_reference: advance.id,
      description: 'Hoàn tạm ứng',
      status: 'POSTED',
      created_by_user_id: '00000000-0000-0000-0000-000000000070',
      created_at: new Date('2026-09-03T08:00:00Z'),
    };
    const tx = {
      $queryRaw: jest.fn().mockResolvedValue([]),
      customer_transactions: {
        findUnique: jest.fn().mockResolvedValue({ status: 'COMPLETED' }),
      },
      bank_accounts: {
        findUnique: jest.fn()
          .mockResolvedValueOnce(target)
          .mockResolvedValueOnce(source),
        findUniqueOrThrow: jest.fn().mockResolvedValue(target),
        update: jest.fn().mockResolvedValue({}),
      },
      bank_balance_movements: {
        findUnique: jest.fn().mockResolvedValue(advance),
        findFirst: jest.fn().mockResolvedValue(null),
        create: jest.fn()
          .mockResolvedValueOnce({})
          .mockResolvedValueOnce(settledMovement),
      },
    };
    const prisma = {
      $transaction: jest.fn((callback: (client: typeof tx) => unknown) => callback(tx)),
    };
    const repository = new PrismaBankRepository(prisma as any, {} as any);

    await expect(repository.settleAdvanceCk({
      advanceMovementId: advance.id,
      source: 'BANK_ACCOUNT',
      sourceBankAccountId: source.id,
      settledByUserId: settledMovement.created_by_user_id,
    })).resolves.toEqual(expect.objectContaining({
      movementType: 'ADVANCE_SETTLE',
      balanceBefore: -3_000_000,
      balanceAfter: -1_500_000,
      settlementSource: {
        type: 'BANK_ACCOUNT',
        label: 'TK SOURCE',
        balanceBefore: 10_000_000,
        balanceAfter: 8_500_000,
      },
    }));
    expect(tx.bank_balance_movements.create).toHaveBeenLastCalledWith({
      data: expect.objectContaining({
        movement_type: 'ADVANCE_SETTLE',
        balance_before: -3_000_000,
        balance_after: -1_500_000,
      }),
    });
  });

  it('settles a cash-funded advance from the company head-office fund', async () => {
    const advance = {
      id: '00000000-0000-0000-0000-000000000110',
      movement_no: 'ADVANCE-002',
      bank_account_id: '00000000-0000-0000-0000-000000000120',
      branch_id: '00000000-0000-0000-0000-000000000130',
      movement_type: 'ADVANCE_CK',
      amount: 1_500_000,
      bank_reference: 'DOMESTIC:00000000-0000-0000-0000-000000000140',
    };
    const target = {
      id: advance.bank_account_id,
      account_no: 'TARGET',
      branch_id: advance.branch_id,
      currency_code: 'VND',
      current_balance: -1_500_000,
      status: 'ACTIVE',
    };
    const headOfficeId = '00000000-0000-0000-0000-000000000150';
    const cashAccountId = '00000000-0000-0000-0000-000000000160';
    const settledMovement = {
      id: '00000000-0000-0000-0000-000000000170',
      movement_no: 'ADVANCE-SETTLE-002',
      bank_account_id: target.id,
      branch_id: advance.branch_id,
      movement_type: 'ADVANCE_SETTLE',
      business_date: new Date('2026-09-04'),
      amount: advance.amount,
      currency_code: 'VND',
      balance_before: -1_500_000,
      balance_after: 0,
      bank_reference: advance.id,
      description: 'Hoàn tạm ứng từ Quỹ chung',
      status: 'POSTED',
      created_by_user_id: '00000000-0000-0000-0000-000000000180',
      created_at: new Date('2026-09-04T08:00:00Z'),
    };
    const tx = {
      $queryRaw: jest.fn().mockResolvedValue([]),
      customer_transactions: {
        findUnique: jest.fn().mockResolvedValue({ status: 'COMPLETED' }),
      },
      branch: {
        findUnique: jest.fn().mockResolvedValue({ company_id: '00000000-0000-0000-0000-000000000190' }),
        findFirst: jest.fn().mockResolvedValue({ id: headOfficeId }),
      },
      fund_accounts: {
        findUnique: jest.fn().mockResolvedValue({
          id: cashAccountId,
          code: 'CASH-VND',
          account_type: 'CASH',
          currency_code: 'VND',
          status: 'ACTIVE',
        }),
      },
      ledger_lines: {
        findMany: jest.fn().mockResolvedValue([{ direction: 'DEBIT', amount: 5_000_000 }]),
      },
      cash_movements: {
        create: jest.fn().mockResolvedValue({ id: '00000000-0000-0000-0000-000000000200' }),
      },
      ledger_entries: { create: jest.fn().mockResolvedValue({}) },
      bank_accounts: {
        findUnique: jest.fn().mockResolvedValue(target),
        findUniqueOrThrow: jest.fn().mockResolvedValue(target),
        update: jest.fn().mockResolvedValue({}),
      },
      bank_balance_movements: {
        findUnique: jest.fn().mockResolvedValue(advance),
        findFirst: jest.fn().mockResolvedValue(null),
        create: jest.fn().mockResolvedValue(settledMovement),
      },
    };
    const prisma = {
      $transaction: jest.fn((callback: (client: typeof tx) => unknown) => callback(tx)),
    };
    const repository = new PrismaBankRepository(prisma as any, {} as any);

    await expect(repository.settleAdvanceCk({
      advanceMovementId: advance.id,
      source: 'HEAD_OFFICE_CASH',
      settledByUserId: settledMovement.created_by_user_id,
    })).resolves.toEqual(expect.objectContaining({
      balanceBefore: -1_500_000,
      balanceAfter: 0,
      settlementSource: {
        type: 'HEAD_OFFICE_CASH',
        label: 'Quỹ chung',
        balanceBefore: 5_000_000,
        balanceAfter: 3_500_000,
      },
    }));
    expect(tx.branch.findFirst).toHaveBeenCalledWith(expect.objectContaining({
      where: expect.objectContaining({ type: 'HEAD_OFFICE', status: 'ACTIVE' }),
    }));
    expect(tx.cash_movements.create).toHaveBeenCalledWith({
      data: expect.objectContaining({ branch_id: headOfficeId, fund_account_id: cashAccountId }),
    });
    expect(tx.ledger_entries.create).toHaveBeenCalledWith({
      data: expect.objectContaining({ branch_id: headOfficeId }),
    });
    expect(tx.bank_accounts.update).toHaveBeenLastCalledWith({
      where: { id: target.id },
      data: { current_balance: 0, available_balance: 0 },
    });
  });
});
