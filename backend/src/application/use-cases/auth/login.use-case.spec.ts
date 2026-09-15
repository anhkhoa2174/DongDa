import { ConflictException, UnauthorizedException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { UserRole } from '../../../domain/entities/user.entity';
import { LoginUseCase } from './login.use-case';

const staffUser = {
  id: 'user-1',
  username: 'staff1',
  email: 'staff1@dongda.vn',
  password: 'hashed-password',
  fullName: 'Nhân viên 1',
  role: UserRole.STAFF,
  branchId: 'branch-1',
  branchName: 'Chi nhánh 1',
  isActive: true,
  createdAt: new Date(),
  updatedAt: new Date(),
};

const adminUser = {
  ...staffUser,
  id: 'user-admin',
  username: 'admin',
  role: UserRole.ADMIN,
  branchId: undefined,
  branchName: undefined,
};

const managerUser = {
  ...staffUser,
  id: 'user-manager',
  username: 'manager1',
  role: UserRole.MANAGER,
};

const loginDto = { username: 'staff1', password: 'plain-password' };

function buildUseCase() {
  const userRepo = {
    findByUsername: jest.fn(),
    findById: jest.fn(),
    findAll: jest.fn(),
    existsAdmin: jest.fn(),
    update: jest.fn(),
    deactivate: jest.fn(),
    create: jest.fn(),
  };
  const jwtService = {
    signAccess: jest.fn().mockReturnValue('signed-access-token'),
    signRefresh: jest.fn().mockReturnValue('signed-refresh-token'),
    verifyAccess: jest.fn(),
    verifyRefresh: jest.fn(),
  };
  const hashService = {
    compare: jest.fn(),
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

  const useCase = new LoginUseCase(
    userRepo as any,
    jwtService as any,
    hashService as any,
    authSessionRepo as any,
  );

  return { useCase, userRepo, jwtService, hashService, authSessionRepo };
}

describe('LoginUseCase', () => {
  it('rejects STAFF login when another STAFF session is already active on the same branch', async () => {
    const { useCase, userRepo, hashService, authSessionRepo } = buildUseCase();
    userRepo.findByUsername.mockResolvedValue(staffUser);
    hashService.compare.mockResolvedValue(true);
    authSessionRepo.countActiveStaffByBranch.mockResolvedValue(1);

    await expect(useCase.execute(loginDto)).rejects.toBeInstanceOf(ConflictException);
    expect(authSessionRepo.countActiveStaffByBranch).toHaveBeenCalledWith('branch-1');
    expect(authSessionRepo.create).not.toHaveBeenCalled();
  });

  it('allows STAFF login when no other STAFF session is active on the branch, creates a session', async () => {
    const { useCase, userRepo, hashService, authSessionRepo, jwtService } = buildUseCase();
    userRepo.findByUsername.mockResolvedValue(staffUser);
    hashService.compare.mockResolvedValue(true);
    authSessionRepo.countActiveStaffByBranch.mockResolvedValue(0);
    authSessionRepo.create.mockResolvedValue({
      id: 'sess-1',
      userId: 'user-1',
      branchId: 'branch-1',
      role: UserRole.STAFF,
      status: 'ACTIVE',
      refreshTokenHash: 'signed-refresh-token',
      lastHeartbeatAt: new Date(),
      expiresAt: new Date(),
    });

    const result = await useCase.execute(loginDto);

    expect(result.sessionId).toBe('sess-1');
    expect(authSessionRepo.create).toHaveBeenCalledWith(
      expect.objectContaining({
        userId: 'user-1',
        branchId: 'branch-1',
        role: UserRole.STAFF,
        refreshTokenHash: 'signed-refresh-token',
      }),
    );
    expect(jwtService.signAccess).toHaveBeenCalledWith(
      expect.objectContaining({ sessionId: 'sess-1' }),
    );
  });

  it('does not check branch lock for ADMIN role', async () => {
    const { useCase, userRepo, hashService, authSessionRepo } = buildUseCase();
    userRepo.findByUsername.mockResolvedValue(adminUser);
    hashService.compare.mockResolvedValue(true);
    authSessionRepo.create.mockResolvedValue({
      id: 'sess-admin',
      userId: adminUser.id,
      branchId: null,
      role: UserRole.ADMIN,
      status: 'ACTIVE',
      refreshTokenHash: 'signed-refresh-token',
      lastHeartbeatAt: new Date(),
      expiresAt: new Date(),
    });

    const result = await useCase.execute({ username: 'admin', password: 'plain-password' });

    expect(authSessionRepo.countActiveStaffByBranch).not.toHaveBeenCalled();
    expect(result.sessionId).toBe('sess-admin');
  });

  it('does not check branch lock for MANAGER role', async () => {
    const { useCase, userRepo, hashService, authSessionRepo } = buildUseCase();
    userRepo.findByUsername.mockResolvedValue(managerUser);
    hashService.compare.mockResolvedValue(true);
    authSessionRepo.create.mockResolvedValue({
      id: 'sess-manager',
      userId: managerUser.id,
      branchId: managerUser.branchId,
      role: UserRole.MANAGER,
      status: 'ACTIVE',
      refreshTokenHash: 'signed-refresh-token',
      lastHeartbeatAt: new Date(),
      expiresAt: new Date(),
    });

    const result = await useCase.execute({ username: 'manager1', password: 'plain-password' });

    expect(authSessionRepo.countActiveStaffByBranch).not.toHaveBeenCalled();
    expect(result.sessionId).toBe('sess-manager');
  });

  it('translates a DB unique-constraint violation (race condition) into the same ConflictException as the pre-check', async () => {
    const { useCase, userRepo, hashService, authSessionRepo } = buildUseCase();
    userRepo.findByUsername.mockResolvedValue(staffUser);
    hashService.compare.mockResolvedValue(true);
    // Pre-check passes (simulates the race window: another login's insert
    // hasn't landed yet when this count query ran).
    authSessionRepo.countActiveStaffByBranch.mockResolvedValue(0);
    authSessionRepo.create.mockRejectedValue(
      new Prisma.PrismaClientKnownRequestError('Unique constraint failed', {
        code: 'P2002',
        clientVersion: '5.0.0',
      }),
    );

    await expect(useCase.execute(loginDto)).rejects.toBeInstanceOf(ConflictException);
    await expect(useCase.execute(loginDto)).rejects.toThrow(
      'Chi nhánh này đang có nhân viên khác đăng nhập. Vui lòng chờ họ đăng xuất hoặc liên hệ KTTH/GĐ để cưỡng chế đăng xuất.',
    );
  });

  it('rejects login with UnauthorizedException and the same message when user is missing', async () => {
    const { useCase, userRepo, authSessionRepo } = buildUseCase();
    userRepo.findByUsername.mockResolvedValue(null);

    await expect(useCase.execute(loginDto)).rejects.toBeInstanceOf(UnauthorizedException);
    await expect(useCase.execute(loginDto)).rejects.toThrow(
      'Tên đăng nhập hoặc mật khẩu không đúng',
    );
    expect(authSessionRepo.create).not.toHaveBeenCalled();
  });

  it('rejects login with UnauthorizedException and the same message when password is wrong', async () => {
    const { useCase, userRepo, hashService, authSessionRepo } = buildUseCase();
    userRepo.findByUsername.mockResolvedValue(staffUser);
    hashService.compare.mockResolvedValue(false);

    await expect(useCase.execute(loginDto)).rejects.toBeInstanceOf(UnauthorizedException);
    await expect(useCase.execute(loginDto)).rejects.toThrow(
      'Tên đăng nhập hoặc mật khẩu không đúng',
    );
    expect(authSessionRepo.create).not.toHaveBeenCalled();
  });
});
