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

  // Bất kỳ status nào khác ACTIVE đều coi như hết hiệu lực — không chỉ REVOKED.
  // Cron dọn session (SessionCleanupService) đánh dấu session chết heartbeat là
  // 'EXPIRED' trong khi expires_at vẫn còn tới 12h; nếu chỉ check 'REVOKED' thì
  // JwtStrategy/RefreshTokenUseCase vẫn honor token cũ của người đã bị đá ra,
  // dẫn tới 2 STAFF cùng được uỷ quyền trên 1 chi nhánh.
  isExpired(): boolean {
    return this.status !== 'ACTIVE' || new Date() > this.expiresAt;
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
