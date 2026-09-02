import { ForbiddenException, BadRequestException } from '@nestjs/common';
import {
  InternalBankTransferUseCase, ListBankUseCase, RecordBankMovementUseCase, ManageBankAccountUseCase,
} from './bank.use-cases';
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
    transferInternal: jest.fn().mockResolvedValue({ transferReference: 'CKNB-1' }),
    receiveFromProvider: jest.fn(),
  };
}

describe('Bank use-cases — đọc toàn công ty, ghi theo phân quyền', () => {
  it('mọi role thấy tài khoản và lịch sử toàn công ty', async () => {
    const repo = makeRepo();
    const uc = new ListBankUseCase(repo as any);
    await uc.accounts(staffA, BRANCH_B);
    expect(repo.listAccounts).toHaveBeenLastCalledWith(BRANCH_B, false);
    await uc.accounts(admin, BRANCH_B);
    expect(repo.listAccounts).toHaveBeenLastCalledWith(BRANCH_B, false);
    await uc.movements(staffA, 'acc-1');
    expect(repo.listMovements).toHaveBeenLastCalledWith('acc-1');
  });

  it('STAFF không được ghi biến động trên tài khoản chi nhánh khác', async () => {
    const repo = makeRepo();
    repo.findAccount.mockResolvedValue(account(BRANCH_B));
    const uc = new RecordBankMovementUseCase(repo as any);
    await expect(uc.execute('acc-1', { movementType: 'DEPOSIT', amount: 100 }, staffA, 'request-key-1'))
      .rejects.toBeInstanceOf(ForbiddenException);

    repo.findAccount.mockResolvedValue(account(BRANCH_A));
    await uc.execute('acc-1', { movementType: 'DEPOSIT', amount: 100 }, staffA, 'request-key-2');
    expect(repo.createMovement).toHaveBeenCalledWith(expect.objectContaining({
      bankAccountId: 'acc-1', movementType: 'DEPOSIT', amount: 100, createdByUserId: 'staff-a',
      idempotencyKey: 'request-key-2',
    }));
  });

  it('cho phép ghi nhận chuyển khoản vào và chuyển khoản đi', async () => {
    const repo = makeRepo();
    repo.findAccount.mockResolvedValue(account(BRANCH_A));
    const uc = new RecordBankMovementUseCase(repo as any);

    await uc.execute('acc-1', {
      movementType: 'TRANSFER_IN', amount: 500, description: 'Khách chuyển tiền',
    }, staffA, 'request-key-3');
    await uc.execute('acc-1', {
      movementType: 'TRANSFER_OUT', amount: 200, description: 'Thanh toán', counterparty: 'NGUYEN VAN A',
    }, staffA, 'request-key-4');

    expect(repo.createMovement).toHaveBeenNthCalledWith(1, expect.objectContaining({
      movementType: 'TRANSFER_IN', amount: 500, description: 'Khách chuyển tiền',
    }));
    expect(repo.createMovement).toHaveBeenNthCalledWith(2, expect.objectContaining({
      movementType: 'TRANSFER_OUT', amount: 200, counterparty: 'NGUYEN VAN A',
    }));
  });

  it('bắt buộc nội dung CK và người nhận khi chuyển khoản đi', async () => {
    const repo = makeRepo();
    repo.findAccount.mockResolvedValue(account(BRANCH_A));
    const uc = new RecordBankMovementUseCase(repo as any);

    await expect(uc.execute('acc-1', {
      movementType: 'TRANSFER_IN', amount: 500,
    }, staffA, 'request-key-5')).rejects.toBeInstanceOf(BadRequestException);
    await expect(uc.execute('acc-1', {
      movementType: 'TRANSFER_OUT', amount: 500, description: 'Thanh toán',
    }, staffA, 'request-key-6')).rejects.toBeInstanceOf(BadRequestException);
    expect(repo.createMovement).not.toHaveBeenCalled();
  });

  it('CK nội bộ không cho chọn cùng một tài khoản nguồn và đích', async () => {
    const repo = makeRepo();
    const uc = new InternalBankTransferUseCase(repo as any);
    await expect(uc.execute({
      fromBankAccountId: 'acc-1', toBankAccountId: 'acc-1', amount: 100,
    }, admin, 'request-key-7')).rejects.toBeInstanceOf(BadRequestException);
    expect(repo.transferInternal).not.toHaveBeenCalled();
  });

  it('CK nội bộ chuyển actor và dữ liệu đã chuẩn hóa xuống repository', async () => {
    const repo = makeRepo();
    const uc = new InternalBankTransferUseCase(repo as any);
    await uc.execute({
      fromBankAccountId: 'acc-1', toBankAccountId: 'acc-2', amount: 100,
      description: '  Điều chuyển vốn  ', bankReference: ' REF-01 ',
    }, admin, 'request-key-8');
    expect(repo.transferInternal).toHaveBeenCalledWith(expect.objectContaining({
      fromBankAccountId: 'acc-1', toBankAccountId: 'acc-2', amount: 100,
      description: 'Điều chuyển vốn', bankReference: 'REF-01', createdByUserId: 'admin',
      idempotencyKey: 'request-key-8',
    }));
  });

  it('không ngưng tài khoản còn số dư', async () => {
    const repo = makeRepo();
    repo.deactivateAccount.mockRejectedValue(new BadRequestException('Chỉ được ngưng tài khoản khi số dư bằng 0'));
    const uc = new ManageBankAccountUseCase(repo as any);
    await expect(uc.deactivate('acc-1')).rejects.toBeInstanceOf(BadRequestException);
    expect(repo.deactivateAccount).toHaveBeenCalledWith('acc-1');
  });
});
