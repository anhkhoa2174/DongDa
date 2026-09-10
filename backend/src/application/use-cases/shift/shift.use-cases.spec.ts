import { RecordInShiftCashCountUseCase } from './shift.use-cases';

describe('RecordInShiftCashCountUseCase', () => {
  it('records a cash count against the open shift without opening or closing it', async () => {
    const repo = {
      recordCashCount: jest.fn().mockResolvedValue({ id: 'count-1' }),
      openShift: jest.fn(),
      closeShift: jest.fn(),
    };
    const useCase = new RecordInShiftCashCountUseCase(repo as any);

    await useCase.execute('shift-1', {
      branchId: 'branch-1',
      counts: [{
        currency: 'USD',
        actualAmount: 101,
        denominations: [
          { denomination: 100, quantity: 1 },
          { denomination: 1, quantity: 1 },
        ],
      }],
      note: 'Kiểm tra giữa ca',
    }, 'user-1');

    expect(repo.recordCashCount).toHaveBeenCalledWith({
      shiftId: 'shift-1',
      branchId: 'branch-1',
      countedByUserId: 'user-1',
      counts: [{
        currency: 'USD',
        actualAmount: 101,
        denominations: [
          { denomination: 100, quantity: 1 },
          { denomination: 1, quantity: 1 },
        ],
      }],
      note: 'Kiểm tra giữa ca',
    });
    expect(repo.openShift).not.toHaveBeenCalled();
    expect(repo.closeShift).not.toHaveBeenCalled();
  });
});
