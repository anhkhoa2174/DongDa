import { useQuery } from '@tanstack/react-query';
import { auditLogApi } from '../api/auditLog.api';

export function useAuditLogs(filter?: { entityType?: string; action?: string }) {
  return useQuery({
    queryKey: ['audit-logs', filter],
    queryFn: () => auditLogApi.list(filter),
  });
}
