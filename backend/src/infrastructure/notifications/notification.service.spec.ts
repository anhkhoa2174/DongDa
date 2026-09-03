import { UserRole } from '../../domain/entities/user.entity';
import { NotificationService } from './notification.service';

describe('NotificationService', () => {
  it('targets control roles globally and only STAFF within affected branches', async () => {
    const findMany = jest.fn().mockResolvedValue([
      { id: 'director-1' },
      { id: 'staff-1' },
    ]);
    const createMany = jest.fn().mockResolvedValue({ count: 2 });
    const service = new NotificationService({
      user: { findMany },
      notifications: { createMany },
    } as any);

    await service.notifyUsers({
      title: 'Phiếu tiếp quỹ đã xác nhận',
      sourceType: 'FUND_TRANSFER_CONFIRMED',
    }, {
      roles: [UserRole.ADMIN, UserRole.MANAGER],
      branchIds: ['branch-1'],
    });

    expect(findMany).toHaveBeenCalledWith(expect.objectContaining({
      where: expect.objectContaining({
        status: 'ACTIVE',
        OR: expect.arrayContaining([
          { user_roles: { some: { roles: { code: { in: [UserRole.ADMIN, UserRole.MANAGER] } } } } },
          {
            AND: [
              { employees: { branch_id: { in: ['branch-1'] }, status: 'ACTIVE' } },
              { user_roles: { some: { roles: { code: { in: [UserRole.STAFF] } } } } },
            ],
          },
        ]),
      }),
    }));
    expect(createMany).toHaveBeenCalledWith({
      data: expect.arrayContaining([
        expect.objectContaining({ recipient_user_id: 'director-1' }),
        expect.objectContaining({ recipient_user_id: 'staff-1' }),
      ]),
    });
  });

  it('deduplicates explicit and resolved recipients and honors exclusions', async () => {
    const createMany = jest.fn().mockResolvedValue({ count: 1 });
    const service = new NotificationService({
      user: { findMany: jest.fn().mockResolvedValue([{ id: 'user-1' }, { id: 'user-2' }]) },
      notifications: { createMany },
    } as any);

    await service.notifyUsers({ title: 'Thông báo', sourceType: 'SYSTEM' }, {
      userIds: ['user-1'],
      roles: [UserRole.ADMIN],
      excludeUserIds: ['user-2'],
    });

    expect(createMany).toHaveBeenCalledWith({
      data: [expect.objectContaining({ recipient_user_id: 'user-1' })],
    });
  });
});
