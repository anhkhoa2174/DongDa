import { UserRole } from './user.entity';

export class AuthSessionEntity {
  id: string;
  userId: string;
  branchId: string | null;
  role: UserRole;
  status: 'ACTIVE' | 'EXPIRED' | 'REVOKED';
  refreshTokenHash: string;
  lastHeartbeatAt: Date;
  expiresAt: Date;

  constructor(data: {
    id: string;
    userId: string;
    branchId: string | null;
    role: UserRole;
    status: 'ACTIVE' | 'EXPIRED' | 'REVOKED';
    refreshTokenHash: string;
    lastHeartbeatAt: Date;
    expiresAt: Date;
  }) {
    Object.assign(this, data);
  }

  isExpired(): boolean {
    return this.status === 'REVOKED' || new Date() > this.expiresAt;
  }

  isHeartbeatStale(timeoutSeconds: number): boolean {
    const staleThreshold = new Date(Date.now() - timeoutSeconds * 1000);
    return this.lastHeartbeatAt < staleThreshold;
  }

  toJwtClaim(): { sessionId: string; expiresAt: string } {
    return {
      sessionId: this.id,
      expiresAt: this.expiresAt.toISOString(),
    };
  }

  shouldEnforceBranchLock(): boolean {
    return this.role === UserRole.STAFF && !!this.branchId;
  }
}
