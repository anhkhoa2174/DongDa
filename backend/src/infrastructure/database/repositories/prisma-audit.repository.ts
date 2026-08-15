// Prisma Audit Repository — append-only
// Layer: Infrastructure

import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma.service';
import {
  IAuditRepository, AuditEntry, AuditLogRecord, ListAuditFilter,
} from '../../../domain/repositories/audit.repository';

@Injectable()
export class PrismaAuditRepository implements IAuditRepository {
  constructor(private readonly prisma: PrismaService) {}

  async append(entry: AuditEntry): Promise<void> {
    await this.prisma.audit_logs.create({
      data: {
        user_id: entry.userId ?? null,
        action: entry.action.slice(0, 100),
        entity_type: entry.entityType.slice(0, 100),
        entity_id: entry.entityId ?? null,
        before_data: entry.beforeData ?? undefined,
        after_data: entry.afterData ?? undefined,
        ip_address: entry.ipAddress ?? null,
        user_agent: entry.userAgent ?? null,
      },
    });
  }

  async list(filter?: ListAuditFilter): Promise<AuditLogRecord[]> {
    const rows = await this.prisma.audit_logs.findMany({
      where: {
        ...(filter?.userId && { user_id: filter.userId }),
        ...(filter?.entityType && { entity_type: filter.entityType }),
        ...(filter?.action && { action: { contains: filter.action, mode: 'insensitive' } }),
        ...((filter?.from || filter?.to) && {
          created_at: {
            ...(filter?.from && { gte: filter.from }),
            ...(filter?.to && { lte: filter.to }),
          },
        }),
      },
      orderBy: { created_at: 'desc' },
      take: 200,
    });
    return rows.map((r) => ({
      id: r.id,
      userId: r.user_id,
      action: r.action,
      entityType: r.entity_type,
      entityId: r.entity_id,
      beforeData: r.before_data,
      afterData: r.after_data,
      ipAddress: r.ip_address,
      userAgent: r.user_agent,
      createdAt: r.created_at,
    }));
  }
}
