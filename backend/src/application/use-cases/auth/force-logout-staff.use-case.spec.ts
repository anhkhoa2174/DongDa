import { ForbiddenException, NotFoundException } from '@nestjs/common';
import { UserRole } from '../../../domain/entities/user.entity';
import { ForceLogoutStaffUseCase } from './force-logout-staff.use-case';

const adminUser = {
  id: 'admin-1',
  username: 'admin',
  email: 'admin@dongda.vn',
  password: 'hashed-password',
  fullName: 'Giám đốc',
  role: UserRole.ADMIN,
  branchId: undefined,
  branchName: undefined,
  isActive: true,
  createdAt: new Date(),
  updatedAt: new Date(),
};

const managerUser = {
  ...adminUser,
  id: 'mgr-1',
  username: 'manager1',
  role: UserRole.MANAGER,
  branchId: 'branch-1',
  branchName: 'Chi nhánh 1',
};

const managerHoUser = {
  ...adminUser,
  id: 'mgr-ho',
  username: 'manager-ho',
  role: UserRole.MANAGER,
  branchId: null,
  branchName: undefined,
};

const staffUser = {
  ...adminUser,
  id: 'staff-1',
  username: 'staff1',
  role: UserRole.STAFF,
  branchId: 'branch-1',
  branchName: 'Chi nhánh 1',
};

const auditorUser = {
  ...adminUser,
  id: 'aud-1',
  username: 'auditor1',
  role: UserRole.AUDITOR,
  branchId: 'branch-1',
  branchName: 'Chi nhánh 1',
};

function buildSession(
  overrides: Partial<{ id: string; userId: string; branchId: string | null; role: UserRole }> = {},
) {
  return {
    id: overrides.id ?? 'sess-1',
    userId: overrides.userId ?? 'staff-target',
    branchId: overrides.branchId !== undefined ? overrides.branchId : 'branch-1',
    role: overrides.role ?? UserRole.STAFF,
    status: 'ACTIVE' as const,
    refreshTokenHash: 'hashed-refresh',
    lastHeartbeatAt: new Date(),
    expiresAt: new Date(),
  };
}

function buildUseCase() {
  const userRepo = {
    findByUsername: jest.fn(),
    findById: jest.fn(),
    findByEmail: jest.fn(),
    findAll: jest.fn(),
    existsAdmin: jest.fn(),
    update: jest.fn(),
    deactivate: jest.fn(),
    save: jest.fn(),
  };
  const authSessionRepo = {
    create: jest.fn(),
    findById: jest.fn(),
    findActiveByBranchAndRole: jest.fn(),
    updateHeartbeat: jest.fn(),
    revokeById: jest.fn(),
    revokeByUserId: jest.fn(),
    revokeExpiredSessions: jest.fn(),
    countActiveStaffByBranch: jest.fn(),
  };

  const useCase = new ForceLogoutStaffUseCase(authSessionRepo as any, userRepo as any);

  return { useCase, userRepo, authSessionRepo };
}

describe('ForceLogoutStaffUseCase', () => {
  it('ADMIN can force-logout any Staff session regardless of branch', async () => {
    const { useCase, userRepo, authSessionRepo } = buildUseCase();
    userRepo.findById.mockResolvedValue(adminUser);
    const session = buildSession({ id: 'sess-1', userId: 'staff-target', branchId: 'branch-1' });
    authSessionRepo.findById.mockResolvedValue(session);
    authSessionRepo.revokeById.mockResolvedValue(undefined);

    const result = await useCase.execute('admin-1', 'sess-1');

    expect(result.revokedSessionId).toBe('sess-1');
    expect(result.userId).toBe('staff-target');
    expect(result.branchId).toBe('branch-1');
    expect(authSessionRepo.revokeById).toHaveBeenCalledWith('sess-1');
  });

  it('MANAGER can force-logout a Staff session on their own branch', async () => {
    const { useCase, userRepo, authSessionRepo } = buildUseCase();
    userRepo.findById.mockResolvedValue(managerUser);
    const session = buildSession({ id: 'sess-2', userId: 'staff-target', branchId: 'branch-1' });
    authSessionRepo.findById.mockResolvedValue(session);
    authSessionRepo.revokeById.mockResolvedValue(undefined);

    const result = await useCase.execute('mgr-1', 'sess-2');

    expect(result.revokedSessionId).toBe('sess-2');
    expect(authSessionRepo.revokeById).toHaveBeenCalledWith('sess-2');
  });

  it('MANAGER cannot force-logout a Staff session on a different branch', async () => {
    const { useCase, userRepo, authSessionRepo } = buildUseCase();
    userRepo.findById.mockResolvedValue(managerUser);
    const session = buildSession({ id: 'sess-3', userId: 'staff-target', branchId: 'branch-2' });
    authSessionRepo.findById.mockResolvedValue(session);

    await expect(useCase.execute('mgr-1', 'sess-3')).rejects.toBeInstanceOf(ForbiddenException);
    expect(authSessionRepo.revokeById).not.toHaveBeenCalled();
  });

  it('MANAGER with no branchId (Hội sở-level, global scope) can force-logout a Staff session on any branch', async () => {
    const { useCase, userRepo, authSessionRepo } = buildUseCase();
    userRepo.findById.mockResolvedValue(managerHoUser);
    const session = buildSession({ id: 'sess-ho', userId: 'staff-target', branchId: 'branch-1' });
    authSessionRepo.findById.mockResolvedValue(session);
    authSessionRepo.revokeById.mockResolvedValue(undefined);

    const result = await useCase.execute('mgr-ho', 'sess-ho');

    expect(result.revokedSessionId).toBe('sess-ho');
    expect(authSessionRepo.revokeById).toHaveBeenCalledWith('sess-ho');
  });

  it('STAFF cannot force-logout anyone', async () => {
    const { useCase, userRepo, authSessionRepo } = buildUseCase();
    userRepo.findById.mockResolvedValue(staffUser);

    await expect(useCase.execute('staff-1', 'sess-4')).rejects.toBeInstanceOf(ForbiddenException);
    expect(authSessionRepo.findById).not.toHaveBeenCalled();
    expect(authSessionRepo.revokeById).not.toHaveBeenCalled();
  });

  it('AUDITOR cannot force-logout anyone', async () => {
    const { useCase, userRepo, authSessionRepo } = buildUseCase();
    userRepo.findById.mockResolvedValue(auditorUser);

    await expect(useCase.execute('aud-1', 'sess-5')).rejects.toBeInstanceOf(ForbiddenException);
    expect(authSessionRepo.findById).not.toHaveBeenCalled();
    expect(authSessionRepo.revokeById).not.toHaveBeenCalled();
  });

  it('rejects force-logout of a non-STAFF target session (e.g. another MANAGER)', async () => {
    const { useCase, userRepo, authSessionRepo } = buildUseCase();
    userRepo.findById.mockResolvedValue(adminUser);
    const session = buildSession({
      id: 'sess-mgr',
      userId: 'mgr-target',
      branchId: 'branch-1',
      role: UserRole.MANAGER,
    });
    authSessionRepo.findById.mockResolvedValue(session);

    await expect(useCase.execute('admin-1', 'sess-mgr')).rejects.toBeInstanceOf(ForbiddenException);
    expect(authSessionRepo.revokeById).not.toHaveBeenCalled();
  });

  it('a Hội sở MANAGER (branchId null) cannot force-logout an ADMIN session via the branch-bypass path', async () => {
    const { useCase, userRepo, authSessionRepo } = buildUseCase();
    userRepo.findById.mockResolvedValue(managerHoUser);
    const session = buildSession({
      id: 'sess-admin',
      userId: 'admin-target',
      branchId: null,
      role: UserRole.ADMIN,
    });
    authSessionRepo.findById.mockResolvedValue(session);

    await expect(useCase.execute('mgr-ho', 'sess-admin')).rejects.toBeInstanceOf(ForbiddenException);
    expect(authSessionRepo.revokeById).not.toHaveBeenCalled();
  });

  it('throws NotFoundException if the target session does not exist', async () => {
    const { useCase, userRepo, authSessionRepo } = buildUseCase();
    userRepo.findById.mockResolvedValue(adminUser);
    authSessionRepo.findById.mockResolvedValue(null);

    await expect(useCase.execute('admin-1', 'sess-missing')).rejects.toBeInstanceOf(NotFoundException);
    expect(authSessionRepo.revokeById).not.toHaveBeenCalled();
  });
});
