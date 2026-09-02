import { ConflictException } from '@nestjs/common';
import { claimFinancialRequest, completeFinancialRequest } from './financial-idempotency';

describe('financial idempotency', () => {
  it('claims a new request', async () => {
    const tx = { $executeRaw: jest.fn().mockResolvedValue(1) };

    await expect(claimFinancialRequest(tx, 'FX:user-1', 'request-key-1', { amount: 100 }))
      .resolves.toBeNull();
    expect(tx.$executeRaw).toHaveBeenCalledTimes(1);
  });

  it('returns the stored response for the same key and payload', async () => {
    let requestHash = '';
    const tx = {
      $executeRaw: jest.fn().mockImplementation((_sql: unknown, ...values: unknown[]) => {
        requestHash = String(values[2]);
        return Promise.resolve(1);
      }),
      $queryRaw: jest.fn(),
    };
    const request = { branchId: 'branch-1', amount: 100 };
    await claimFinancialRequest(tx, 'FX:user-1', 'request-key-1', request);

    tx.$executeRaw.mockResolvedValue(0);
    tx.$queryRaw.mockResolvedValue([{ request_hash: requestHash, response: { transactionId: 'tx-1' } }]);
    await expect(claimFinancialRequest(tx, 'FX:user-1', 'request-key-1', request))
      .resolves.toEqual({ transactionId: 'tx-1' });
  });

  it('rejects reusing a key with different data', async () => {
    const tx = {
      $executeRaw: jest.fn().mockResolvedValue(0),
      $queryRaw: jest.fn().mockResolvedValue([{ request_hash: 'different', response: { transactionId: 'tx-1' } }]),
    };

    await expect(claimFinancialRequest(tx, 'FX:user-1', 'request-key-1', { amount: 200 }))
      .rejects.toBeInstanceOf(ConflictException);
  });

  it('stores the response before the financial transaction commits', async () => {
    const tx = { $executeRaw: jest.fn().mockResolvedValue(1) };

    await completeFinancialRequest(tx, 'FX:user-1', 'request-key-1', { transactionId: 'tx-1' });
    expect(tx.$executeRaw).toHaveBeenCalledTimes(1);
  });
});
