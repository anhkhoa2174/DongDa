// Repository Interface: AuthSession (Port) — khoá phiên đăng nhập theo chi nhánh
// Layer: Domain

import type { AuthSessionEntity } from '../entities/auth-session.entity';
import type { UserRole } from '../entities/user.entity';

export interface CreateAuthSessionInput {
  userId: string;
  branchId: string | null;
  role: UserRole;
  refreshTokenHash: string;
  expiresAt: Date;
  deviceIp?: string;
  userAgent?: string;
}

export interface IAuthSessionRepository {
  create(input: CreateAuthSessionInput): Promise<AuthSessionEntity>;
  findById(sessionId: string): Promise<AuthSessionEntity | null>;
  findActiveByBranchAndRole(branchId: string, role: UserRole): Promise<AuthSessionEntity[]>;
  updateHeartbeat(sessionId: string): Promise<AuthSessionEntity | null>;
  revokeById(sessionId: string): Promise<void>;
  revokeByUserId(userId: string): Promise<number>;
  revokeExpiredSessions(): Promise<number>;
  revokeStaleHeartbeatSessions(timeoutSeconds: number): Promise<number>;
  countActiveStaffByBranch(branchId: string): Promise<number>;
}
