import { BadRequestException } from '@nestjs/common';
import { TransactionAdminController } from './transaction-admin.controller';

describe('TransactionAdminController adjustment vouchers', () => {
  const transactionId = '00000000-0000-0000-0000-000000000001';
  const originalShiftId = '00000000-0000-0000-0000-000000000002';
  const postingShiftId = '00000000-0000-0000-0000-000000000003';
  const userId = '00000000-0000-0000-0000-000000000004';
  const originalBusinessDate = new Date('2026-08-01T00:00:00.000Z');
  const originalCreatedAt = new Date('2026-08-01T03:15:00.000Z');

  it('builds a WU replacement payload with editable business fields', () => {
    const controller = new TransactionAdminController({} as any, {} as any);
    const payload = (controller as any).buildAdjustmentPayload(
      {
        operation_code: 'WU',
        customer_name: 'Khách cũ',
        customer_phone: '0900000000',
        wu_transaction_details: {
          mtcn: '1234567890', bank_account_id: 'bank-usd', paid_currency: 'USD', payout_currency: 'USD',
          applied_rate: 25_500, received_usd: 1000, received_vnd: 12_750,
          sending_country: 'USA', receiver_date_of_birth: new Date('1990-01-01'), current_address: 'Hà Nội',
          identity_document_type: 'CCCD', identity_document_number: '001', identity_place_of_issue: 'CỤC CẢNH SÁT',
          identity_issuing_country: 'VIETNAM', identity_issue_date: new Date('2020-01-01'),
          identity_expiry_date: new Date('2030-01-01'), has_visa: false, employment_status: 'Kinh doanh',
          country_of_birth: 'VIETNAM', nationality: 'VIETNAM', sender_relationship: 'Người thân',
          receive_purpose: 'Chi phí đi lại', sender_name: 'Người gửi', received_date: new Date('2026-08-01'),
        },
      },
      {
        action: 'REPLACE',
        reason: 'Nhập nhầm số tiền',
        correctedData: {
          mtcn: '9998887776', wuUsdAmount: 1000.5, wuVndAmount: 25_600_000,
          paidCurrency: 'VND', payoutCurrency: 'VND', appliedRate: 25_550,
          receivedUsd: 0, receivedVnd: 25_600_000,
        },
      },
    );

    expect(payload).toEqual(expect.objectContaining({
      action: 'REPLACE',
      correctedData: expect.objectContaining({
        mtcn: '9998887776',
        wuUsdAmount: 1000.5,
        wuVndAmount: 25_600_000,
        paidCurrency: 'VND',
        payoutCurrency: 'VND',
        receivedVnd: 25_600_000,
      }),
    }));
  });

  it('does not require corrected amounts for a void voucher', () => {
    const controller = new TransactionAdminController({} as any, {} as any);
    expect((controller as any).buildAdjustmentPayload(
      { operation_code: 'WU' },
      { action: 'VOID', reason: 'Hủy giao dịch tạo nhầm' },
    )).toEqual({ action: 'VOID' });
  });

  it('allows an MG edit to change reference, paid currency, payout and rate', () => {
    const controller = new TransactionAdminController({} as any, {} as any);
    const payload = (controller as any).buildAdjustmentPayload(
      {
        operation_code: 'MG',
        customer_name: 'Khách cũ',
        mg_transaction_details: {
          reference_no: 'AB12CD34', paid_currency: 'USD', payout_currency: 'VND',
          payout_amount: 2_550_000, received_usd: 0, received_vnd: 2_550_000, applied_rate: 25_500,
        },
      },
      {
        action: 'REPLACE',
        reason: 'Sai loại tiền hoàn',
        correctedData: {
          referenceNo: 'ZX98YU76', customerName: 'Khách đúng', paidCurrency: 'VND', paidAmount: 2_600_000,
          payoutCurrency: 'USD', payoutAmount: 100, receivedUsd: 100, receivedVnd: 0, appliedRate: 26_000,
        },
      },
    );

    expect(payload).toEqual({
      action: 'REPLACE',
      correctedData: {
        referenceNo: 'ZX98YU76', customerName: 'Khách đúng', paidCurrency: 'VND', paidAmount: 2_600_000,
        payoutCurrency: 'USD', payoutAmount: 100, receivedUsd: 100, receivedVnd: 0, appliedRate: 26_000,
      },
    });
  });

  it.each(['RECONCILED', 'SETTLED'])('blocks every edit or void path when debt is %s', async (status) => {
    const tx = {
      $queryRaw: jest.fn().mockResolvedValue([]),
      debt_accounts: {
        findUnique: jest.fn()
          .mockResolvedValueOnce({ id: 'debt-1' })
          .mockResolvedValueOnce({ lifecycle_status: status }),
      },
    };
    const controller = new TransactionAdminController({} as any, {} as any);

    await expect((controller as any).assertTransactionNotReconciled(tx, transactionId))
      .rejects.toThrow('không được sửa, thay thế hoặc hủy');
  });

  it('blocks voiding a domestic transfer after its advance has been settled', async () => {
    const tx = {
      $queryRaw: jest.fn().mockResolvedValue([]),
      customer_transactions: {
        findUnique: jest.fn().mockResolvedValue({
          id: transactionId,
          transaction_no: 'DT-001',
          operation_code: 'DOMESTIC_TRANSFER',
          branch_id: 'branch-1',
          shift_id: originalShiftId,
          status: 'COMPLETED',
        }),
      },
      debt_accounts: { findUnique: jest.fn().mockResolvedValue(null), updateMany: jest.fn() },
      debt_movements: { findMany: jest.fn().mockResolvedValue([]) },
      shifts: { findUnique: jest.fn().mockResolvedValue({ id: postingShiftId, branch_id: 'branch-1', status: 'OPEN' }) },
      ledger_entries: { findMany: jest.fn().mockResolvedValue([]) },
      bank_balance_movements: {
        findFirst: jest.fn()
          .mockResolvedValueOnce({
            id: 'advance-1', bank_account_id: 'bank-1', movement_type: 'ADVANCE_CK', amount: 100,
          })
          .mockResolvedValueOnce({ movement_no: 'ADV-SETTLE-001' }),
      },
    };
    const controller = new TransactionAdminController({} as any, {} as any);

    await expect((controller as any).voidPostedTransactionInTx(
      tx,
      transactionId,
      userId,
      'Sai số tiền',
      'VOID_TRANSACTION',
      { postingShiftId },
    )).rejects.toThrow('khoản ứng chuyển khoản đã được hoàn');
  });

  it('voids an unsettled domestic advance while the bank account remains negative', async () => {
    const bankMovementCreate = jest.fn().mockResolvedValue({ id: 'reversal-bank-1' });
    const bankAccountUpdate = jest.fn().mockResolvedValue({ id: 'bank-1' });
    const tx = {
      $queryRaw: jest.fn().mockResolvedValue([]),
      customer_transactions: {
        findUnique: jest.fn().mockResolvedValue({
          id: transactionId,
          transaction_no: 'DT-001',
          operation_code: 'DOMESTIC_TRANSFER',
          branch_id: 'branch-1',
          shift_id: originalShiftId,
          status: 'COMPLETED',
        }),
        updateMany: jest.fn().mockResolvedValue({ count: 1 }),
        findUniqueOrThrow: jest.fn().mockResolvedValue({ id: transactionId, status: 'VOIDED' }),
      },
      shifts: {
        findUnique: jest.fn().mockResolvedValue({
          id: postingShiftId, branch_id: 'branch-1', status: 'OPEN', shift_code: 'SHIFT-NEW',
        }),
      },
      debt_accounts: { findUnique: jest.fn().mockResolvedValue(null), updateMany: jest.fn() },
      debt_movements: { findMany: jest.fn().mockResolvedValue([]), create: jest.fn() },
      debt_settlement_allocations: { aggregate: jest.fn() },
      ledger_entries: {
        findMany: jest.fn().mockResolvedValue([{
          id: 'ledger-1',
          branch_id: 'branch-1',
          ledger_lines: [{
            fund_account_id: 'fund-vnd', direction: 'DEBIT', amount: 1_000_000,
            currency_code: 'VND', exchange_rate: 1, base_amount_vnd: 1_000_000,
          }],
        }]),
        create: jest.fn().mockResolvedValue({ id: 'reversal-ledger-1' }),
      },
      ledger_lines: {
        findMany: jest.fn().mockResolvedValue([{
          direction: 'DEBIT', amount: 2_000_000, currency_code: 'VND',
        }]),
      },
      bank_balance_movements: {
        findFirst: jest.fn()
          .mockResolvedValueOnce({
            id: 'advance-1', bank_account_id: 'bank-1', movement_type: 'ADVANCE_CK',
            amount: 1_000_000, currency_code: 'VND',
          })
          .mockResolvedValueOnce(null),
        create: bankMovementCreate,
      },
      bank_accounts: {
        findUnique: jest.fn().mockResolvedValue({ id: 'bank-1', current_balance: -2_000_000 }),
        update: bankAccountUpdate,
      },
      audit_logs: { create: jest.fn().mockResolvedValue({ id: 'audit-1' }) },
    };
    const controller = new TransactionAdminController({} as any, {} as any);

    await (controller as any).voidPostedTransactionInTx(
      tx,
      transactionId,
      userId,
      'Sai số tiền',
      'DIRECT_VOID_TRANSACTION',
      { postingShiftId },
    );

    expect(bankMovementCreate).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({
        movement_type: 'TRANSFER_IN',
        balance_before: -2_000_000,
        balance_after: -1_000_000,
        bank_reference: `DOMESTIC_VOID:${transactionId}`,
      }),
    }));
    expect(bankAccountUpdate).toHaveBeenCalledWith(expect.objectContaining({
      data: { current_balance: -1_000_000, available_balance: -1_000_000 },
    }));
  });

  it('rejects corrected monetary amounts with more than two decimal places', () => {
    const controller = new TransactionAdminController({} as any, {} as any);
    expect(() => (controller as any).buildAdjustmentPayload(
      { operation_code: 'FX', fx_transaction_details: { fx_currency: 'USD', is_buy: false, rate: 25_500 } },
      { action: 'REPLACE', reason: 'Sai tiền', correctedData: { fxAmount: 1.234 } },
    )).toThrow(BadRequestException);
  });

  it('builds a full FX replacement including side, currency, fraction, rate and deduction', () => {
    const controller = new TransactionAdminController({} as any, {} as any);
    expect((controller as any).buildAdjustmentPayload(
      {
        operation_code: 'FX', customer_name: 'Khách cũ',
        fx_transaction_details: { fx_currency: 'USD', is_buy: true, rate: 25_500, fractional_amount: 0, deduction_vnd: 0 },
      },
      {
        action: 'REPLACE', reason: 'Sai ngoại tệ', correctedData: {
          isBuy: true, fxCurrency: 'EUR', fxAmount: 10, fractionalAmount: 0.5,
          deductionVnd: 1_000, rate: 28_500, customerName: 'Khách đúng',
        },
      },
    )).toEqual({
      action: 'REPLACE',
      correctedData: {
        isBuy: true, fxCurrency: 'EUR', fxAmount: 10.5, fractionalAmount: 0.5,
        deductionVnd: 1_000, rate: 28_500, customerName: 'Khách đúng',
      },
    });
  });

  it('creates a WU replacement with recalculated fund and debt data', async () => {
    const wuDetailCreate = jest.fn().mockResolvedValue({ id: 'detail-new' });
    const transactionCreate = jest.fn().mockResolvedValue({
      id: 'replacement-1', transaction_no: 'WU-R2-001', revision: 2,
    });
    const tx = {
      $queryRaw: jest.fn().mockResolvedValue([]),
      $executeRaw: jest.fn().mockResolvedValue(1),
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
          created_at: originalCreatedAt,
          wu_transaction_details: {
            mtcn: '1234567890',
            paid_currency: 'USD',
            payout_currency: 'USD',
            received_usd: 0,
            received_vnd: 12_725,
            system_rate: 25_500,
            applied_rate: 25_450,
          },
          mg_transaction_details: null,
          fx_transaction_details: null,
        }),
        create: transactionCreate,
        findFirst: jest.fn().mockResolvedValue(null),
      },
      exchange_rates: {
        findFirst: jest.fn()
          .mockResolvedValueOnce({ rate: 25_500 })
          .mockResolvedValueOnce({ rate: 25_900 }),
      },
      bank_accounts: { findFirst: jest.fn().mockResolvedValue({ id: 'bank-usd' }) },
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
      {
        mtcn: '1234567890', bankAccountId: 'bank-usd',
        wuUsdAmount: 0.5, wuVndAmount: 12_725,
        paidCurrency: 'USD', payoutCurrency: 'USD', appliedRate: 25_450,
        receivedUsd: 0, receivedVnd: 12_725,
      },
      'request-1',
    );

    expect(transactionCreate).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({
        replacement_of_transaction_id: transactionId,
        revision: 2,
        business_date: originalBusinessDate,
        created_at: originalCreatedAt,
      }),
    }));
    expect(wuDetailCreate).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({
        mtcn: '1234567890',
        payout_currency: 'USD',
        system_rate: 25_500,
        applied_rate: 25_450,
        wu_usd_amount: 0.5,
        wu_vnd_amount: 12_725,
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
