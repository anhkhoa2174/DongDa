import { SessionCleanupService } from './session-cleanup.service';

function buildService(configValue?: string) {
  const authSessionRepo = {
    revokeExpiredSessions: jest.fn().mockResolvedValue(0),
    revokeStaleHeartbeatSessions: jest.fn().mockResolvedValue(0),
  };
  const configService = { get: jest.fn().mockReturnValue(configValue) };
  const service = new SessionCleanupService(authSessionRepo as any, configService as any);
  return { service, authSessionRepo, configService };
}

describe('SessionCleanupService', () => {
  it('calls both revokeExpiredSessions and revokeStaleHeartbeatSessions on each run', async () => {
    const { service, authSessionRepo } = buildService('300');
    authSessionRepo.revokeExpiredSessions.mockResolvedValue(2);
    authSessionRepo.revokeStaleHeartbeatSessions.mockResolvedValue(3);

    await service.cleanupExpiredSessions();

    expect(authSessionRepo.revokeExpiredSessions).toHaveBeenCalledTimes(1);
    expect(authSessionRepo.revokeStaleHeartbeatSessions).toHaveBeenCalledWith(300);
  });

  it('reads AUTH_SESSION_HEARTBEAT_TIMEOUT_SEC from config, defaults to 300 if unset', async () => {
    const { service, authSessionRepo } = buildService(undefined);

    await service.cleanupExpiredSessions();

    expect(authSessionRepo.revokeStaleHeartbeatSessions).toHaveBeenCalledWith(300);
  });

  it('does not throw if the repository calls reject — logs and swallows the error', async () => {
    const { service, authSessionRepo } = buildService('300');
    authSessionRepo.revokeExpiredSessions.mockRejectedValue(new Error('db down'));

    await service.cleanupExpiredSessions();
  });
});
