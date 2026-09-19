import { BadRequestException, NotFoundException } from '@nestjs/common';
import { PrismaBranchRepository } from './prisma-branch.repository';

describe('PrismaBranchRepository.deactivate — không xóa, chỉ vô hiệu hóa', () => {
  it('vô hiệu hóa chi nhánh thường: đặt status INACTIVE, giữ nguyên các trường khác', async () => {
    const prisma = {
      branch: {
        findUnique: jest.fn().mockResolvedValue({
          id: 'branch-1', code: 'NCT', name: 'Nguyễn Chí Thanh', type: 'BRANCH', address: null, phone: null,
        }),
        update: jest.fn().mockResolvedValue({
          id: 'branch-1', code: 'NCT', name: 'Nguyễn Chí Thanh', type: 'BRANCH', address: null, phone: null, status: 'INACTIVE',
        }),
      },
    };
    const repository = new PrismaBranchRepository(prisma as any);

    const result = await repository.deactivate('branch-1');

    expect(prisma.branch.update).toHaveBeenCalledWith({
      where: { id: 'branch-1' },
      data: { status: 'INACTIVE' },
    });
    expect(result).toEqual(expect.objectContaining({ id: 'branch-1', code: 'NCT' }));
  });

  it('từ chối vô hiệu hóa Hội sở (HEAD_OFFICE)', async () => {
    const prisma = {
      branch: {
        findUnique: jest.fn().mockResolvedValue({
          id: 'ho-1', code: 'HO', name: 'Hội sở', type: 'HEAD_OFFICE', address: null, phone: null,
        }),
        update: jest.fn(),
      },
    };
    const repository = new PrismaBranchRepository(prisma as any);

    await expect(repository.deactivate('ho-1')).rejects.toThrow(BadRequestException);
    expect(prisma.branch.update).not.toHaveBeenCalled();
  });

  it('báo lỗi rõ ràng nếu chi nhánh không tồn tại', async () => {
    const prisma = {
      branch: {
        findUnique: jest.fn().mockResolvedValue(null),
        update: jest.fn(),
      },
    };
    const repository = new PrismaBranchRepository(prisma as any);

    await expect(repository.deactivate('missing')).rejects.toThrow(NotFoundException);
    expect(prisma.branch.update).not.toHaveBeenCalled();
  });
});
