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
});
