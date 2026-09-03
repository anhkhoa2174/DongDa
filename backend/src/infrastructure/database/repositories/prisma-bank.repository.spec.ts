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
});
