import { NotFoundException, UnauthorizedException } from '@nestjs/common';
import { AuthSessionEntity } from '../../../domain/entities/auth-session.entity';
import { UserRole } from '../../../domain/entities/user.entity';
import { HeartbeatUseCase } from './heartbeat.use-case';

const HEARTBEAT_TIMEOUT_SEC = 300; // 5 phút

function buildSession(overrides: Partial<ConstructorParameters<typeof AuthSessionEntity>[0]> = {}) {
  return new AuthSessionEntity({
    id: 'sess-1',
    userId: 'user-1',
    branchId: 'branch-1',
    role: UserRole.STAFF,
    status: 'ACTIVE',
    refreshTokenHash: 'signed-refresh-token',
    lastHeartbeatAt: new Date(),
    expiresAt: new Date(Date.now() + 3600 * 1000), // 1h trong tương lai
    ...overrides,
  });
}

function buildUseCase(timeoutSec = HEARTBEAT_TIMEOUT_SEC) {
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

  const useCase = new HeartbeatUseCase(authSessionRepo as any, timeoutSec);

  return { useCase, authSessionRepo };
}

describe('HeartbeatUseCase', () => {
  it('refreshes heartbeat and returns fresh session for a valid, active session', async () => {
    const { useCase, authSessionRepo } = buildUseCase();
    const session = buildSession();
    const updatedSession = buildSession({ lastHeartbeatAt: new Date() });

    authSessionRepo.findById.mockResolvedValue(session);
    authSessionRepo.updateHeartbeat.mockResolvedValue(updatedSession);

    const result = await useCase.execute('sess-1');

    expect(result.isStale).toBe(false);
    expect(result.sessionId).toBe('sess-1');
    expect(result.expiresAt).toBe(updatedSession.expiresAt);
    expect(authSessionRepo.updateHeartbeat).toHaveBeenCalledWith('sess-1');
    // Dọn session hết hạn là việc của cron SessionCleanupService, không phải của
    // mỗi request heartbeat.
    expect(authSessionRepo.revokeExpiredSessions).not.toHaveBeenCalled();
  });

  it('throws UnauthorizedException if the session is expired (expiresAt in the past)', async () => {
    const { useCase, authSessionRepo } = buildUseCase();
    const session = buildSession({ expiresAt: new Date(Date.now() - 1000) });

    authSessionRepo.findById.mockResolvedValue(session);

    await expect(useCase.execute('sess-1')).rejects.toBeInstanceOf(UnauthorizedException);
    expect(authSessionRepo.updateHeartbeat).not.toHaveBeenCalled();
  });

  it('throws UnauthorizedException and revokes the session if heartbeat is stale beyond timeout', async () => {
    const { useCase, authSessionRepo } = buildUseCase(300); // 5 phút
    const session = buildSession({
      lastHeartbeatAt: new Date(Date.now() - 10 * 60 * 1000), // 10 phút trước
      expiresAt: new Date(Date.now() + 3600 * 1000), // vẫn còn hạn tuyệt đối
    });

    authSessionRepo.findById.mockResolvedValue(session);

    await expect(useCase.execute('sess-1')).rejects.toBeInstanceOf(UnauthorizedException);
    expect(authSessionRepo.revokeById).toHaveBeenCalledWith('sess-1');
    expect(authSessionRepo.updateHeartbeat).not.toHaveBeenCalled();
  });

  it('throws NotFoundException if the session does not exist', async () => {
    const { useCase, authSessionRepo } = buildUseCase();
    authSessionRepo.findById.mockResolvedValue(null);

    await expect(useCase.execute('sess-missing')).rejects.toBeInstanceOf(NotFoundException);
    expect(authSessionRepo.updateHeartbeat).not.toHaveBeenCalled();
  });
});
