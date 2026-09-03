import { AdvanceReminderService } from './advance-reminder.service';

describe('AdvanceReminderService', () => {
  it('does not remind users about advances whose transactions were voided', async () => {
    const notifyUsers = jest.fn();
    const prisma = {
      bank_balance_movements: {
        findMany: jest.fn()
          .mockResolvedValueOnce([{
            id: 'advance-1',
            amount: 1_500_000,
            currency_code: 'VND',
            branch_id: 'branch-1',
            bank_reference: 'DOMESTIC:00000000-0000-0000-0000-000000000001',
          }])
          .mockResolvedValueOnce([]),
      },
      customer_transactions: {
        findMany: jest.fn().mockResolvedValue([{
          id: '00000000-0000-0000-0000-000000000001',
        }]),
      },
    };
    const service = new AdvanceReminderService(prisma as any, { notifyUsers } as any);

    await service.remindUnsettledAdvances();

    expect(notifyUsers).not.toHaveBeenCalled();
  });
});
