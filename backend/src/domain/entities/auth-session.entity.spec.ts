import { AuthSessionEntity } from './auth-session.entity';
import { UserRole } from './user.entity';

describe('AuthSessionEntity', () => {
  const now = new Date();
  const futureDate = new Date(now.getTime() + 3600000);
  const pastDate = new Date(now.getTime() - 600000);

  it('isExpired returns true if status is REVOKED', () => {
    const session = new AuthSessionEntity({
      id: 'sess-1',
      userId: 'user-1',
      branchId: 'branch-1',
      role: UserRole.STAFF,
      status: 'REVOKED',
      refreshTokenHash: 'hash',
      lastHeartbeatAt: now,
      expiresAt: futureDate,
    });
    expect(session.isExpired()).toBe(true);
  });

  it('isExpired returns true if status is EXPIRED even when expiresAt is still in the future', () => {
    const session = new AuthSessionEntity({
      id: 'sess-1',
      userId: 'user-1',
      branchId: 'branch-1',
      role: UserRole.STAFF,
      status: 'EXPIRED',
      refreshTokenHash: 'hash',
      lastHeartbeatAt: now,
      expiresAt: futureDate,
    });
    expect(session.isExpired()).toBe(true);
  });

  it('isExpired returns true if expiresAt has passed', () => {
    const session = new AuthSessionEntity({
      id: 'sess-1',
      userId: 'user-1',
      branchId: 'branch-1',
      role: UserRole.STAFF,
      status: 'ACTIVE',
      refreshTokenHash: 'hash',
      lastHeartbeatAt: now,
      expiresAt: pastDate,
    });
    expect(session.isExpired()).toBe(true);
  });

  it('isExpired returns false for a valid active session', () => {
    const session = new AuthSessionEntity({
      id: 'sess-1',
      userId: 'user-1',
      branchId: 'branch-1',
      role: UserRole.STAFF,
      status: 'ACTIVE',
      refreshTokenHash: 'hash',
      lastHeartbeatAt: now,
      expiresAt: futureDate,
    });
    expect(session.isExpired()).toBe(false);
  });

  it('isHeartbeatStale returns true if lastHeartbeatAt is older than timeout', () => {
    const session = new AuthSessionEntity({
      id: 'sess-1',
      userId: 'user-1',
      branchId: 'branch-1',
      role: UserRole.STAFF,
      status: 'ACTIVE',
      refreshTokenHash: 'hash',
      lastHeartbeatAt: pastDate,
      expiresAt: futureDate,
    });
    expect(session.isHeartbeatStale(300)).toBe(true); // 5 min timeout, heartbeat 10 min ago
  });

  it('isHeartbeatStale returns false if lastHeartbeatAt is within timeout', () => {
    const session = new AuthSessionEntity({
      id: 'sess-1',
      userId: 'user-1',
      branchId: 'branch-1',
      role: UserRole.STAFF,
      status: 'ACTIVE',
      refreshTokenHash: 'hash',
      lastHeartbeatAt: now,
      expiresAt: futureDate,
    });
    expect(session.isHeartbeatStale(300)).toBe(false);
  });

  it('toJwtClaim returns sessionId and ISO expiresAt', () => {
    const session = new AuthSessionEntity({
      id: 'sess-1',
      userId: 'user-1',
      branchId: 'branch-1',
      role: UserRole.STAFF,
      status: 'ACTIVE',
      refreshTokenHash: 'hash',
      lastHeartbeatAt: now,
      expiresAt: futureDate,
    });
    expect(session.toJwtClaim()).toEqual({
      sessionId: 'sess-1',
      expiresAt: futureDate.toISOString(),
    });
  });

  it('shouldEnforceBranchLock returns true only for STAFF with a branchId', () => {
    const staffSession = new AuthSessionEntity({
      id: 'sess-1',
      userId: 'user-1',
      branchId: 'branch-1',
      role: UserRole.STAFF,
      status: 'ACTIVE',
      refreshTokenHash: 'hash',
      lastHeartbeatAt: now,
      expiresAt: futureDate,
    });
    expect(staffSession.shouldEnforceBranchLock()).toBe(true);

    const adminSession = new AuthSessionEntity({
      id: 'sess-2',
      userId: 'user-2',
      branchId: 'branch-1',
      role: UserRole.ADMIN,
      status: 'ACTIVE',
      refreshTokenHash: 'hash',
      lastHeartbeatAt: now,
      expiresAt: futureDate,
    });
    expect(adminSession.shouldEnforceBranchLock()).toBe(false);

    const staffNoBranch = new AuthSessionEntity({
      id: 'sess-3',
      userId: 'user-3',
      branchId: null,
      role: UserRole.STAFF,
      status: 'ACTIVE',
      refreshTokenHash: 'hash',
      lastHeartbeatAt: now,
      expiresAt: futureDate,
    });
    expect(staffNoBranch.shouldEnforceBranchLock()).toBe(false);
  });
});
