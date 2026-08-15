import { ForbiddenException } from '@nestjs/common';
import { ConfirmTransferUseCase, ConvertCentralFundUseCase, RejectTransferUseCase } from './fund-transfer.use-cases';
import { FundTransferStatus } from '../../../domain/entities/fund.entity';
import { UserRole } from '../../../domain/entities/user.entity';

const transfer = {
  id: 'transfer-1',
  transferNo: 'FT-001',
  sourceBranchId: 'branch-a',
  destinationBranchId: 'branch-b',
  items: [],
  status: FundTransferStatus.PENDING,
  createdByUserId: 'maker-1',
  createdAt: new Date(),
};

describe('fund transfer receiver controls', () => {
  it('prevents the maker from confirming their own transfer', async () => {
    const repo = { findTransferById: jest.fn().mockResolvedValue(transfer), confirmTransfer: jest.fn() };
    const useCase = new ConfirmTransferUseCase(repo as any);
    await expect(useCase.execute('transfer-1', { id: 'maker-1', role: UserRole.MANAGER }))
      .rejects.toBeInstanceOf(ForbiddenException);
    expect(repo.confirmTransfer).not.toHaveBeenCalled();
  });

  it('allows only staff of the destination branch to reject', async () => {
    const repo = { findTransferById: jest.fn().mockResolvedValue(transfer), rejectTransfer: jest.fn() };
    const useCase = new RejectTransferUseCase(repo as any);
    await expect(useCase.execute('transfer-1', {
      id: 'staff-a', role: UserRole.STAFF, branchId: 'branch-a',
    })).rejects.toBeInstanceOf(ForbiddenException);
    expect(repo.rejectTransfer).not.toHaveBeenCalled();
  });

  it('allows a different staff member of the destination branch to confirm', async () => {
    const repo = {
      findTransferById: jest.fn().mockResolvedValue(transfer),
      confirmTransfer: jest.fn().mockResolvedValue({ ...transfer, status: FundTransferStatus.CONFIRMED }),
    };
    const useCase = new ConfirmTransferUseCase(repo as any);

    await expect(useCase.execute('transfer-1', {
      id: 'staff-b', role: UserRole.STAFF, branchId: 'branch-b',
    })).resolves.toMatchObject({ status: FundTransferStatus.CONFIRMED });
    expect(repo.confirmTransfer).toHaveBeenCalledWith('transfer-1', 'staff-b');
  });
});

describe('central Fund A conversion', () => {
  it('passes a normalized conversion request and actor to the repository', async () => {
    const converted = {
      voucherNo: 'QDA-001',
      items: [{ currencyCode: 'EUR', amount: 100, rate: 30_000, vndAmount: 3_000_000 }],
      totalVndAmount: 3_000_000, postedAt: new Date(),
    };
    const repo = { convertCentralFund: jest.fn().mockResolvedValue(converted) };
    const useCase = new ConvertCentralFundUseCase(repo as any);

    await expect(useCase.execute({ items: [{ currencyCode: 'EUR', amount: 100 }], note: '  Đổi tại ngân hàng  ' }, 'admin-1'))
      .resolves.toEqual(converted);
    expect(repo.convertCentralFund).toHaveBeenCalledWith({
      items: [{ currencyCode: 'EUR', amount: 100 }], note: 'Đổi tại ngân hàng', createdByUserId: 'admin-1',
    });
  });
});
