import { BadRequestException } from '@nestjs/common';
import { ApprovePendingDebtUseCase } from './approve-pending-debt.use-case';

describe('ApprovePendingDebtUseCase', () => {
  it('cắt khoảng trắng lý do rồi chuyển xuống repository', async () => {
    const debtRepo = { approvePending: jest.fn().mockResolvedValue({ id: 'debt-1' }) };
    const useCase = new ApprovePendingDebtUseCase(debtRepo as any);

    await useCase.execute('debt-1', { reason: '  Lệch 1 USD do làm tròn  ' }, 'mgr-1');

    expect(debtRepo.approvePending).toHaveBeenCalledWith({
      debtAccountId: 'debt-1', reason: 'Lệch 1 USD do làm tròn', approvedByUserId: 'mgr-1',
    });
  });

  it('từ chối khi lý do chỉ toàn khoảng trắng', () => {
    const debtRepo = { approvePending: jest.fn() };
    const useCase = new ApprovePendingDebtUseCase(debtRepo as any);

    expect(() => useCase.execute('debt-1', { reason: '   ' }, 'mgr-1')).toThrow(BadRequestException);
    expect(debtRepo.approvePending).not.toHaveBeenCalled();
  });
});
