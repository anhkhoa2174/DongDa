import { BadRequestException } from '@nestjs/common';
import { TransactionAdminController } from './transaction-admin.controller';

describe('TransactionAdminController adjustment vouchers', () => {
  const transactionId = '00000000-0000-0000-0000-000000000001';
  const originalShiftId = '00000000-0000-0000-0000-000000000002';
  const postingShiftId = '00000000-0000-0000-0000-000000000003';
  const userId = '00000000-0000-0000-0000-000000000004';

  it('posts reversal ledger lines into the current open shift', async () => {
    const ledgerCreate = jest.fn().mockResolvedValue({ id: 'reversal-entry' });
    const tx = {
      $queryRaw: jest.fn().mockResolvedValue([]),
      customer_transactions: {
        findUnique: jest.fn().mockResolvedValue({
          id: transactionId,
          transaction_no: 'WU-001',
          branch_id: 'branch-1',
          shift_id: originalShiftId,
          status: 'COMPLETED',
        }),
        updateMany: jest.fn().mockResolvedValue({ count: 1 }),
        findUniqueOrThrow: jest.fn().mockResolvedValue({ id: transactionId, status: 'VOIDED' }),
      },
      shifts: {
        findUnique: jest.fn().mockResolvedValue({
          id: postingShiftId,
          branch_id: 'branch-1',
          status: 'OPEN',
          shift_code: 'SHIFT-NEW',
        }),
      },
      debt_movements: {
        findMany: jest.fn().mockResolvedValue([]),
        findFirst: jest.fn(),
        create: jest.fn(),
      },
      debt_settlement_allocations: { aggregate: jest.fn() },
      ledger_entries: {
        findMany: jest.fn().mockResolvedValue([{
          id: 'entry-1',
          branch_id: 'branch-1',
          shift_id: originalShiftId,
          ledger_lines: [{
            fund_account_id: 'fund-1', direction: 'CREDIT', amount: 100,
            currency_code: 'USD', exchange_rate: 26_000, base_amount_vnd: 2_600_000,
          }],
        }]),
        create: ledgerCreate,
      },
      audit_logs: { create: jest.fn().mockResolvedValue({ id: 'audit-1' }) },
    };
    const controller = new TransactionAdminController({} as any, {} as any);

    await (controller as any).voidPostedTransactionInTx(
      tx,
      transactionId,
      userId,
      'Sai số tiền',
      'APPROVE_TRANSACTION_ADJUSTMENT',
      { postingShiftId, approvalRequestId: 'request-1' },
    );

    expect(ledgerCreate).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({ shift_id: postingShiftId, reversed_entry_id: 'entry-1' }),
    }));
    expect(tx.audit_logs.create).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({
        after_data: expect.objectContaining({ originalShiftId, postingShiftId, approvalRequestId: 'request-1' }),
      }),
    }));
  });

  it('does not approve a closed-shift voucher when the branch has no open shift', async () => {
    const tx = {
      $queryRaw: jest.fn().mockResolvedValue([]),
      approval_requests: {
        findUnique: jest.fn().mockResolvedValue({
          id: 'request-1', entity_type: 'CUSTOMER_TRANSACTION_ADJUSTMENT',
          entity_id: transactionId, requested_by_user_id: 'requester-2', status: 'PENDING', note: 'Sai số tiền',
        }),
      },
      customer_transactions: {
        findUnique: jest.fn().mockResolvedValue({
          id: transactionId, transaction_no: 'WU-001', branch_id: 'branch-1',
          shifts: { id: originalShiftId, status: 'CLOSED' },
        }),
      },
      shifts: { findFirst: jest.fn().mockResolvedValue(null) },
    };
    const prisma = { $transaction: jest.fn((callback) => callback(tx)) };
    const controller = new TransactionAdminController(prisma as any, {} as any);

    await expect(controller.approveAdjustmentRequest(
      { user: { id: userId } },
      'request-1',
      { reason: 'Đồng ý điều chỉnh' },
    )).rejects.toBeInstanceOf(BadRequestException);
  });
});
