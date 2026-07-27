import { httpClient } from '@/shared/api/httpClient';

export interface AuditLogDto {
  id: string;
  userId?: string | null;
  action: string;
  entityType: string;
  entityId?: string | null;
  beforeData?: any;
  afterData?: any;
  ipAddress?: string | null;
  userAgent?: string | null;
  createdAt: string;
}

export const auditLogApi = {
  list: (params?: { entityType?: string; action?: string; userId?: string }) =>
    httpClient.get<AuditLogDto[]>('/audit-logs', { params }).then((r) => r.data),
};
