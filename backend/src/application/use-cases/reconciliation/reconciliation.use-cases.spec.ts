import { BadRequestException } from '@nestjs/common';
import { RunReconciliationUseCase } from './reconciliation.use-cases';

describe('RunReconciliationUseCase', () => {
  it('rejects duplicate journal references before reading or writing financial data', async () => {
    const repo = {
      listSystemTxByProvider: jest.fn(),
      saveRun: jest.fn(),
    };
    const useCase = new RunReconciliationUseCase(repo as any);

    await expect(useCase.execute({
      provider: 'MG',
      businessDate: '2026-08-01',
      rows: [
        { code: 'ab12cd34', amount: 100, currencyCode: 'USD', branchId: '00000000-0000-0000-0000-000000000001' },
        { code: 'AB12CD34', amount: 100, currencyCode: 'USD', branchId: '00000000-0000-0000-0000-000000000001' },
      ],
    }, 'user-1')).rejects.toBeInstanceOf(BadRequestException);
    expect(repo.listSystemTxByProvider).not.toHaveBeenCalled();
    expect(repo.saveRun).not.toHaveBeenCalled();
  });
});
