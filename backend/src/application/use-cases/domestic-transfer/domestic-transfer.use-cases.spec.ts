import { BadRequestException } from '@nestjs/common';
import { CreateDomesticTransferUseCase } from './domestic-transfer.use-cases';

describe('CreateDomesticTransferUseCase', () => {
  const repository = {
    create: jest.fn(),
    list: jest.fn(),
    findById: jest.fn(),
    listBankAccounts: jest.fn(),
  };
  const useCase = new CreateDomesticTransferUseCase(repository);

  beforeEach(() => jest.clearAllMocks());

  it('creates cash-to-bank transaction with normalized fee', async () => {
    repository.create.mockResolvedValue({ id: 'transaction-id' });
    const dto = {
      branchId: 'branch-id',
      transferType: 'CASH_TO_BANK' as const,
      bankAccountId: 'bank-account-id',
      customerName: 'NGUYEN VAN A', counterpartyBank: 'ACB', counterpartyAccount: '123456789',
      transferReference: 'CK-001', transferNote: 'Thanh toan',
      amount: 1_000_000,
      fee: 10_000,
      feePaymentMethod: 'CASH' as const,
    };

    await expect(useCase.execute(dto, 'user-id')).resolves.toEqual({ id: 'transaction-id' });
    expect(repository.create).toHaveBeenCalledWith({ ...dto, fee: 10_000, createdByUserId: 'user-id' });
  });

  it('rejects bank-to-cash when fee consumes the whole transfer', () => {
    const dto = {
      branchId: 'branch-id',
      transferType: 'BANK_TO_CASH' as const,
      bankAccountId: 'bank-account-id',
      customerName: 'NGUYEN VAN A', counterpartyBank: 'ACB', counterpartyAccount: '123456789',
      transferReference: 'CK-002', transferNote: 'Thanh toan',
      amount: 100_000,
      fee: 100_000,
      feePaymentMethod: 'BANK' as const,
    };

    expect(() => useCase.execute(dto, 'user-id')).toThrow(BadRequestException);
    expect(repository.create).not.toHaveBeenCalled();
  });
});
