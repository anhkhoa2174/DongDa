// Prisma AuthSession Repository — khoá "chỉ 1 Staff đăng nhập / chi nhánh"
// Layer: Infrastructure

import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma.service';
import {
  CreateAuthSessionInput, IAuthSessionRepository,
} from '../../../domain/repositories/auth-session.repository';
import { AuthSessionEntity } from '../../../domain/entities/auth-session.entity';
import { UserRole } from '../../../domain/entities/user.entity';

@Injectable()
export class PrismaAuthSessionRepository implements IAuthSessionRepository {
  constructor(private readonly prisma: PrismaService) {}

  async create(input: CreateAuthSessionInput): Promise<AuthSessionEntity> {
    const row = await this.prisma.auth_sessions.create({
      data: {
        user_id: input.userId,
        branch_id: input.branchId,
        role: input.role,
        refresh_token_hash: input.refreshTokenHash,
        expires_at: input.expiresAt,
        device_ip: input.deviceIp,
        user_agent: input.userAgent,
        last_heartbeat_at: new Date(),
        status: 'ACTIVE',
      },
    });
    return toDomain(row);
  }

  async findById(sessionId: string): Promise<AuthSessionEntity | null> {
    const row = await this.prisma.auth_sessions.findUnique({ where: { id: sessionId } });
    return row ? toDomain(row) : null;
  }

  async findActiveByBranchAndRole(branchId: string, role: UserRole): Promise<AuthSessionEntity[]> {
    const rows = await this.prisma.auth_sessions.findMany({
      where: {
        branch_id: branchId,
        role,
        status: 'ACTIVE',
        expires_at: { gt: new Date() },
      },
    });
    return rows.map(toDomain);
  }

  async updateHeartbeat(sessionId: string): Promise<AuthSessionEntity | null> {
    try {
      const row = await this.prisma.auth_sessions.update({
        where: { id: sessionId },
        data: { last_heartbeat_at: new Date() },
      });
      return toDomain(row);
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2025') {
        return null;
      }
      throw error;
    }
  }

  async revokeById(sessionId: string): Promise<void> {
    await this.prisma.auth_sessions.update({
      where: { id: sessionId },
      data: { status: 'REVOKED' },
    });
  }

  async revokeByUserId(userId: string): Promise<number> {
    const result = await this.prisma.auth_sessions.updateMany({
      where: { user_id: userId, status: { not: 'REVOKED' } },
      data: { status: 'REVOKED' },
    });
    return result.count;
  }

  async revokeExpiredSessions(): Promise<number> {
    const result = await this.prisma.auth_sessions.updateMany({
      where: { expires_at: { lt: new Date() }, status: { not: 'REVOKED' } },
      data: { status: 'EXPIRED' },
    });
    return result.count;
  }

  async countActiveStaffByBranch(branchId: string): Promise<number> {
    return this.prisma.auth_sessions.count({
      where: {
        branch_id: branchId,
        role: 'STAFF',
        status: 'ACTIVE',
        expires_at: { gt: new Date() },
      },
    });
  }
}

function toDomain(raw: {
  id: string;
  user_id: string;
  branch_id: string | null;
  role: string;
  status: string;
  refresh_token_hash: string;
  last_heartbeat_at: Date;
  expires_at: Date;
}): AuthSessionEntity {
  return new AuthSessionEntity({
    id: raw.id,
    userId: raw.user_id,
    branchId: raw.branch_id,
    role: raw.role as UserRole,
    status: raw.status as 'ACTIVE' | 'EXPIRED' | 'REVOKED',
    refreshTokenHash: raw.refresh_token_hash,
    lastHeartbeatAt: raw.last_heartbeat_at,
    expiresAt: raw.expires_at,
  });
}
