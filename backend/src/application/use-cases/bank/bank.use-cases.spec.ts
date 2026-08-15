import { ForbiddenException, BadRequestException } from '@nestjs/common';
import { ListBankUseCase, RecordBankMovementUseCase, ManageBankAccountUseCase } from './bank.use-cases';
import { UserRole } from '../../../domain/entities/user.entity';

const BRANCH_A = 'branch-a';
const BRANCH_B = 'branch-b';
const admin = { id: 'admin', role: UserRole.ADMIN, branchId: null };
const staffA = { id: 'staff-a', role: UserRole.STAFF, branchId: BRANCH_A };
const account = (branchId: string, balance = 0, status = 'ACTIVE') => ({
  id: 'acc-1', branchId, currentBalance: balance, status, currencyCode: 'VND',
});

function makeRepo() {
  return {
    listBanks: jest.fn(),
    listAccounts: jest.fn().mockResolvedValue([]),
    findAccount: jest.fn(),
    createAccount: jest.fn(),
    deactivateAccount: jest.fn(),
    listMovements: jest.fn().mockResolvedValue([]),
    createMovement: jest.fn().mockResolvedValue({ id: 'mv-1' }),
    receiveFromProvider: jest.fn(),
  };
}

describe('Bank use-cases — mỗi chi nhánh có ngân hàng riêng', () => {
  it('STAFF chỉ thấy tài khoản/biến động của chi nhánh mình; GĐ lọc tùy ý', async () => {
    const repo = makeRepo();
    const uc = new ListBankUseCase(repo as any);
    await uc.accounts(staffA, BRANCH_B);
    expect(repo.listAccounts).toHaveBeenLastCalledWith(BRANCH_A, false);
    await uc.accounts(admin, BRANCH_B);
    expect(repo.listAccounts).toHaveBeenLastCalledWith(BRANCH_B, false);
    await uc.movements(staffA, 'acc-1');
    expect(repo.listMovements).toHaveBeenLastCalledWith('acc-1', BRANCH_A);
  });

  it('STAFF không được ghi biến động trên tài khoản chi nhánh khác', async () => {
    const repo = makeRepo();
    repo.findAccount.mockResolvedValue(account(BRANCH_B));
    const uc = new RecordBankMovementUseCase(repo as any);
    await expect(uc.execute('acc-1', { movementType: 'DEPOSIT', amount: 100 }, staffA))
      .rejects.toBeInstanceOf(ForbiddenException);

    repo.findAccount.mockResolvedValue(account(BRANCH_A));
    await uc.execute('acc-1', { movementType: 'TRANSFER_IN', amount: 100, counterparty: 'Khách A' }, staffA);
    expect(repo.createMovement).toHaveBeenCalledWith(expect.objectContaining({
      bankAccountId: 'acc-1', movementType: 'TRANSFER_IN', amount: 100, counterparty: 'Khách A', createdByUserId: 'staff-a',
    }));
  });

  it('không ngưng tài khoản còn số dư', async () => {
    const repo = makeRepo();
    repo.findAccount.mockResolvedValue(account(BRANCH_A, 500));
    const uc = new ManageBankAccountUseCase(repo as any);
    await expect(uc.deactivate('acc-1')).rejects.toBeInstanceOf(BadRequestException);
    expect(repo.deactivateAccount).not.toHaveBeenCalled();
  });
});
