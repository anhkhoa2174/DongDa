import { BadRequestException } from '@nestjs/common';
import { allocateDebtSettlement } from './debt-settlement-allocation';

describe('allocateDebtSettlement', () => {
  it('allocates FIFO across source debt movements', async () => {
    const create = jest.fn().mockResolvedValue(undefined);
    const tx = {
      $queryRaw: jest.fn().mockResolvedValue([
        { id: 'debt-1', remaining: 60 },
        { id: 'debt-2', remaining: 50 },
      ]),
      debt_settlement_allocations: { create },
    };

    await allocateDebtSettlement(tx, 'account-1', 'settlement-1', 80);

    expect(create).toHaveBeenNthCalledWith(1, {
      data: { settlement_movement_id: 'settlement-1', debt_movement_id: 'debt-1', amount: 60 },
    });
    expect(create).toHaveBeenNthCalledWith(2, {
      data: { settlement_movement_id: 'settlement-1', debt_movement_id: 'debt-2', amount: 20 },
    });
  });

  it('rejects an amount that cannot be allocated', async () => {
    const tx = {
      $queryRaw: jest.fn().mockResolvedValue([{ id: 'debt-1', remaining: 10 }]),
      debt_settlement_allocations: { create: jest.fn().mockResolvedValue(undefined) },
    };

    await expect(allocateDebtSettlement(tx, 'account-1', 'settlement-1', 20))
      .rejects.toBeInstanceOf(BadRequestException);
  });
});
