import { UnauthorizedException } from '@nestjs/common';
import { AuthSessionEntity } from '../../../domain/entities/auth-session.entity';
import { UserRole } from '../../../domain/entities/user.entity';
import { RefreshTokenUseCase } from './refresh-token.use-case';

const activeUser = {
  id: 'u1',
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

function buildSession(overrides: Partial<ConstructorParameters<typeof AuthSessionEntity>[0]> = {}) {
  return new AuthSessionEntity({
    id: 's1',
    userId: 'u1',
    branchId: 'branch-1',
    role: UserRole.STAFF,
    status: 'ACTIVE',
    refreshTokenHash: 'signed-refresh-token',
    lastHeartbeatAt: new Date(),
    expiresAt: new Date(Date.now() + 3600 * 1000), // 1h trong tương lai
    ...overrides,
  });
}

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
    signAccess: jest.fn().mockReturnValue('new-access-token'),
    signRefresh: jest.fn().mockReturnValue('new-refresh-token'),
    verifyAccess: jest.fn(),
    verifyRefresh: jest.fn(),
  };
  const authSessionRepo = {
    create: jest.fn(),
    findById: jest.fn(),
    findActiveByBranchAndRole: jest.fn(),
    updateHeartbeat: jest.fn(),
    revokeById: jest.fn(),
    revokeByUserId: jest.fn(),
    revokeExpiredSessions: jest.fn(),
    revokeStaleHeartbeatSessions: jest.fn(),
    countActiveStaffByBranch: jest.fn(),
  };

  const useCase = new RefreshTokenUseCase(
    userRepo as any,
    jwtService as any,
    authSessionRepo as any,
  );

  return { useCase, userRepo, jwtService, authSessionRepo };
}

describe('RefreshTokenUseCase', () => {
  it('propagates sessionId from the refresh token into both new tokens when the session is alive', async () => {
    const { useCase, userRepo, jwtService, authSessionRepo } = buildUseCase();
    jwtService.verifyRefresh.mockReturnValue({ sub: 'u1', sessionId: 's1', type: 'refresh' });
    userRepo.findById.mockResolvedValue(activeUser);
    authSessionRepo.findById.mockResolvedValue(buildSession());

    const result = await useCase.execute('some-refresh-token');

    expect(authSessionRepo.findById).toHaveBeenCalledWith('s1');
    expect(jwtService.signAccess).toHaveBeenCalledWith(
      expect.objectContaining({ sessionId: 's1' }),
    );
    expect(jwtService.signRefresh).toHaveBeenCalledWith(
      expect.objectContaining({ sessionId: 's1' }),
    );
    expect(result.accessToken).toBe('new-access-token');
    expect(result.refreshToken).toBe('new-refresh-token');
  });

  it('rejects the refresh if the session has been revoked (force-logout cannot be bypassed by refreshing)', async () => {
    const { useCase, userRepo, jwtService, authSessionRepo } = buildUseCase();
    jwtService.verifyRefresh.mockReturnValue({ sub: 'u1', sessionId: 's1', type: 'refresh' });
    userRepo.findById.mockResolvedValue(activeUser);
    authSessionRepo.findById.mockResolvedValue(buildSession({ status: 'REVOKED' }));

    await expect(useCase.execute('some-refresh-token')).rejects.toBeInstanceOf(
      UnauthorizedException,
    );
    expect(jwtService.signAccess).not.toHaveBeenCalled();
    expect(jwtService.signRefresh).not.toHaveBeenCalled();
  });

  it('rejects the refresh if the session has expired', async () => {
    const { useCase, userRepo, jwtService, authSessionRepo } = buildUseCase();
    jwtService.verifyRefresh.mockReturnValue({ sub: 'u1', sessionId: 's1', type: 'refresh' });
    userRepo.findById.mockResolvedValue(activeUser);
    authSessionRepo.findById.mockResolvedValue(
      buildSession({ expiresAt: new Date(Date.now() - 1000) }),
    );

    await expect(useCase.execute('some-refresh-token')).rejects.toBeInstanceOf(
      UnauthorizedException,
    );
    expect(jwtService.signAccess).not.toHaveBeenCalled();
    expect(jwtService.signRefresh).not.toHaveBeenCalled();
  });

  it('rejects the refresh if the session no longer exists', async () => {
    const { useCase, userRepo, jwtService, authSessionRepo } = buildUseCase();
    jwtService.verifyRefresh.mockReturnValue({ sub: 'u1', sessionId: 's1', type: 'refresh' });
    userRepo.findById.mockResolvedValue(activeUser);
    authSessionRepo.findById.mockResolvedValue(null);

    await expect(useCase.execute('some-refresh-token')).rejects.toBeInstanceOf(
      UnauthorizedException,
    );
    expect(jwtService.signAccess).not.toHaveBeenCalled();
    expect(jwtService.signRefresh).not.toHaveBeenCalled();
  });

  it('skips session validation entirely for a legacy refresh token with no sessionId (backward compat)', async () => {
    const { useCase, userRepo, jwtService, authSessionRepo } = buildUseCase();
    jwtService.verifyRefresh.mockReturnValue({ sub: 'u1', type: 'refresh' });
    userRepo.findById.mockResolvedValue(activeUser);

    const result = await useCase.execute('legacy-refresh-token');

    expect(authSessionRepo.findById).not.toHaveBeenCalled();
    expect(result.accessToken).toBe('new-access-token');
    expect(result.refreshToken).toBe('new-refresh-token');
  });

  it('preserves existing behavior: rejects an invalid/expired refresh JWT', async () => {
    const { useCase, jwtService, authSessionRepo } = buildUseCase();
    jwtService.verifyRefresh.mockImplementation(() => {
      throw new Error('jwt expired');
    });

    await expect(useCase.execute('bad-token')).rejects.toBeInstanceOf(UnauthorizedException);
    expect(authSessionRepo.findById).not.toHaveBeenCalled();
  });
});
