import { validate } from 'class-validator';
import { CreateDomesticTransferDto } from './domestic-transfer.dto';

const basePayload: CreateDomesticTransferDto = {
  branchId: '11111111-1111-4111-8111-111111111111',
  transferType: 'BANK_TO_CASH',
  bankAccountId: '22222222-2222-4222-8222-222222222222',
  transferReference: 'REF-001',
  amount: 1_000_000,
  fee: 10_000,
  feePaymentMethod: 'CASH',
  transferNote: 'Nhan chuyen khoan, tra tien mat',
};

describe('CreateDomesticTransferDto', () => {
  it('allows customer bank details to be omitted for bank-to-cash', async () => {
    const dto = Object.assign(new CreateDomesticTransferDto(), basePayload);

    await expect(validate(dto)).resolves.toHaveLength(0);
  });

  it('requires customer bank details for cash-to-bank', async () => {
    const dto = Object.assign(new CreateDomesticTransferDto(), {
      ...basePayload,
      transferType: 'CASH_TO_BANK',
    });

    const errors = await validate(dto);
    expect(errors.map((error) => error.property)).toEqual(
      expect.arrayContaining(['customerName', 'counterpartyBank', 'counterpartyAccount']),
    );
  });
});
