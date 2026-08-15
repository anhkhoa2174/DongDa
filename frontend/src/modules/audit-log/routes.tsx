import { AuditLogPage } from './pages/AuditLogPage';
import { AuditLogLivePage } from './pages/AuditLogLivePage';

export const auditLogRoutes = [
  { path: 'audit-log', element: <AuditLogPage /> },
  { path: 'audit-log/live', element: <AuditLogLivePage /> },
];
