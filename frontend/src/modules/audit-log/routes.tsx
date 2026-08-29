import { Navigate } from 'react-router-dom';
import { AuditLogLivePage } from './pages/AuditLogLivePage';

export const auditLogRoutes = [
  { path: 'audit-log', element: <AuditLogLivePage /> },
  { path: 'audit-log/live', element: <Navigate to="/audit-log" replace /> },
];
