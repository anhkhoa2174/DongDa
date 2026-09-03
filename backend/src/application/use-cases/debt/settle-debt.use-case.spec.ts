import { BadRequestException } from '@nestjs/common';
import { DebtStatus } from '../../../domain/entities/debt.entity';
import { SettleVndCashDebtUseCase } from './settle-debt.use-case';

const summary = {
  id: 'debt-1',
  transactionId: 'transaction-1',
  branchId: 'branch-1',
  providerCode: 'WU',
  currencyCode: 'VND',
  businessDate: new Date('2026-08-31'),
  name: 'Công nợ WU - WU-001',
  totalDebt: 1_000_000,
  totalSettled: 0,
  outstanding: 1_000_000,
  status: DebtStatus.PENDING,
};

describe('Debt settlement lifecycle', () => {
  it('blocks a PENDING debt', async () => {
    const repo = { getAccountSummary: jest.fn().mockResolvedValue(summary), settleVndCash: jest.fn() };
    const useCase = new SettleVndCashDebtUseCase(repo as any);

    await expect(useCase.execute('debt-1', { amount: 1_000_000 }, 'user-1'))
      .rejects.toBeInstanceOf(BadRequestException);
    expect(repo.settleVndCash).not.toHaveBeenCalled();
  });

  it('blocks partial settlement even after reconciliation', async () => {
    const repo = {
      getAccountSummary: jest.fn().mockResolvedValue({ ...summary, status: DebtStatus.RECONCILED }),
      settleVndCash: jest.fn(),
    };
    const useCase = new SettleVndCashDebtUseCase(repo as any);

    await expect(useCase.execute('debt-1', { amount: 500_000 }, 'user-1'))
      .rejects.toBeInstanceOf(BadRequestException);
    expect(repo.settleVndCash).not.toHaveBeenCalled();
  });

  it('allows the exact outstanding amount for a RECONCILED debt', async () => {
    const movement = { id: 'settlement-1' };
    const repo = {
      getAccountSummary: jest.fn().mockResolvedValue({ ...summary, status: DebtStatus.RECONCILED }),
      settleVndCash: jest.fn().mockResolvedValue(movement),
    };
    const useCase = new SettleVndCashDebtUseCase(repo as any);

    await expect(useCase.execute('debt-1', { amount: 1_000_000 }, 'user-1')).resolves.toBe(movement);
  });
});
