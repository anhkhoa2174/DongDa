import 'reflect-metadata';
import { DebtController } from './debt.controller';
import { ROLES_KEY } from '../guards/roles.guard';
import { UserRole } from '../../../domain/entities/user.entity';

function makeController() {
  const approvePendingDebt = { execute: jest.fn().mockResolvedValue({ id: 'debt-1', status: 'RECONCILED' }) };
  const controller = new DebtController(
    {} as any, {} as any, {} as any, {} as any, approvePendingDebt as any,
  );
  return { controller, approvePendingDebt };
}

describe('DebtController.approve — duyệt tay công nợ', () => {
  it('chuyển id, lý do và người duyệt (từ JWT, không từ body) xuống use-case', async () => {
    const { controller, approvePendingDebt } = makeController();

    const result = await controller.approve({ user: { id: 'mgr-1' } }, 'debt-1', { reason: 'Lệch do làm tròn' });

    expect(approvePendingDebt.execute).toHaveBeenCalledWith('debt-1', { reason: 'Lệch do làm tròn' }, 'mgr-1');
    expect(result).toEqual({ id: 'debt-1', status: 'RECONCILED' });
  });

  it('chỉ ADMIN và MANAGER được duyệt — STAFF/AUDITOR bị RolesGuard chặn', () => {
    const roles: UserRole[] = Reflect.getMetadata(ROLES_KEY, DebtController.prototype.approve);

    expect(roles).toEqual([UserRole.ADMIN, UserRole.MANAGER]);
    expect(roles).not.toContain(UserRole.STAFF);
    expect(roles).not.toContain(UserRole.AUDITOR);
  });

  it('dùng cùng mức quyền với các thao tác xử lý công nợ khác', () => {
    const approveRoles = Reflect.getMetadata(ROLES_KEY, DebtController.prototype.approve);
    const settleRoles = Reflect.getMetadata(ROLES_KEY, DebtController.prototype.settleBatch);

    expect(approveRoles).toEqual(settleRoles);
  });
});
