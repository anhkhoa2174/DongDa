import { BadRequestException } from '@nestjs/common';
import { TransactionAdminController } from './transaction-admin.controller';

describe('TransactionAdminController adjustment vouchers', () => {
  const transactionId = '00000000-0000-0000-0000-000000000001';
  const originalShiftId = '00000000-0000-0000-0000-000000000002';
  const postingShiftId = '00000000-0000-0000-0000-000000000003';
  const userId = '00000000-0000-0000-0000-000000000004';
  const originalBusinessDate = new Date('2026-08-01T00:00:00.000Z');

  it('builds a WU replacement payload with corrected amounts only', () => {
    const controller = new TransactionAdminController({} as any, {} as any);
    const payload = (controller as any).buildAdjustmentPayload(
      { operation_code: 'WU' },
      {
        action: 'REPLACE',
        reason: 'Nhập nhầm số tiền',
        correctedData: { wuUsdAmount: 1000.5, wuVndAmount: 25_600_000 },
      },
    );

    expect(payload).toEqual({
      action: 'REPLACE',
      correctedData: { wuUsdAmount: 1000.5, wuVndAmount: 25_600_000 },
    });
  });

  it('does not require corrected amounts for a void voucher', () => {
    const controller = new TransactionAdminController({} as any, {} as any);
    expect((controller as any).buildAdjustmentPayload(
      { operation_code: 'WU' },
      { action: 'VOID', reason: 'Hủy giao dịch tạo nhầm' },
    )).toEqual({ action: 'VOID' });
  });

  it('blocks every edit or void path once the transaction debt is reconciled', async () => {
    const tx = {
      $queryRaw: jest.fn().mockResolvedValue([]),
      debt_accounts: {
        findUnique: jest.fn()
          .mockResolvedValueOnce({ id: 'debt-1' })
          .mockResolvedValueOnce({ lifecycle_status: 'RECONCILED' }),
      },
    };
    const controller = new TransactionAdminController({} as any, {} as any);

    await expect((controller as any).assertTransactionNotReconciled(tx, transactionId))
      .rejects.toThrow('không được sửa, thay thế hoặc hủy');
  });

  it('rejects corrected monetary amounts with more than two decimal places', () => {
    const controller = new TransactionAdminController({} as any, {} as any);
    expect(() => (controller as any).buildAdjustmentPayload(
      { operation_code: 'FX' },
      { action: 'REPLACE', reason: 'Sai tiền', correctedData: { fxAmount: 1.234 } },
    )).toThrow(BadRequestException);
  });

  it('creates a WU replacement with the original rate snapshot', async () => {
    const wuDetailCreate = jest.fn().mockResolvedValue({ id: 'detail-new' });
    const transactionCreate = jest.fn().mockResolvedValue({
      id: 'replacement-1', transaction_no: 'WU-R2-001', revision: 2,
    });
    const tx = {
      $queryRaw: jest.fn().mockResolvedValue([]),
      customer_transactions: {
        findUnique: jest.fn().mockResolvedValue({
          id: transactionId,
          transaction_no: 'WU-001',
          operation_code: 'WU',
          branch_id: 'branch-1',
          customer_id: null,
          customer_name: 'Khách hàng',
          customer_phone: null,
          status: 'VOIDED',
          revision: 1,
          business_date: originalBusinessDate,
          wu_transaction_details: {
            mtcn: '1234567890',
            paid_currency: 'USD',
            payout_currency: 'USD',
            received_usd: 0,
            system_rate: 25_500,
            applied_rate: 25_450,
          },
          mg_transaction_details: null,
          fx_transaction_details: null,
        }),
        create: transactionCreate,
      },
      fund_accounts: {
        findFirst: jest.fn().mockImplementation(({ where }) => Promise.resolve({ id: `fund-${where.currency_code}` })),
      },
      ledger_lines: {
        findMany: jest.fn().mockResolvedValue([{ direction: 'DEBIT', amount: 1_000_000_000 }]),
      },
      wu_transaction_details: { create: wuDetailCreate },
      ledger_entries: { create: jest.fn().mockResolvedValue({ id: 'ledger-new' }) },
      debt_accounts: { create: jest.fn().mockResolvedValue({ id: 'debt-1' }) },
      debt_movements: { create: jest.fn().mockResolvedValue({ id: 'movement-new' }) },
      audit_logs: { create: jest.fn().mockResolvedValue({ id: 'audit-new' }) },
    };
    const controller = new TransactionAdminController({} as any, {} as any);

    await (controller as any).createReplacementTransactionInTx(
      tx,
      transactionId,
      postingShiftId,
      userId,
      { wuUsdAmount: 0.5, wuVndAmount: 12_000_000 },
      'request-1',
    );

    expect(transactionCreate).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({
        replacement_of_transaction_id: transactionId,
        revision: 2,
        business_date: originalBusinessDate,
      }),
    }));
    expect(wuDetailCreate).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({
        mtcn: '1234567890',
        payout_currency: 'USD',
        system_rate: 25_500,
        applied_rate: 25_450,
        wu_usd_amount: 0.5,
        wu_vnd_amount: 12_000_000,
        received_usd: 0,
        received_vnd: 12_725,
      }),
    }));
    expect(tx.debt_accounts.create).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({
        transaction_id: 'replacement-1',
        business_date: originalBusinessDate,
        lifecycle_status: 'PENDING',
      }),
    }));
  });

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
      debt_accounts: { findUnique: jest.fn().mockResolvedValue(null), updateMany: jest.fn() },
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
