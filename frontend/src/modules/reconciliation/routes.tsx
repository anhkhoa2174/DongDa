import { Navigate } from 'react-router-dom';
import { RoleGuard } from '@/app/guards/RoleGuard';
import { ReconciliationPage } from './pages/ReconciliationPage';
import { ReconciliationWorkspacePage } from './pages/ReconciliationWorkspacePage';

export const reconciliationRoutes = [
  {
    path: 'reconciliation',
    element: (
      <RoleGuard allowedRoles={['director', 'accountant', 'auditor']}>
        <ReconciliationPage />
      </RoleGuard>
    ),
  },
  { path: 'reconciliation/journal', element: <Navigate to="/reconciliation/journal/wu" replace /> },
  {
    path: 'reconciliation/journal/wu',
    element: (
      <RoleGuard allowedRoles={['director', 'accountant', 'auditor', 'branch']}>
        <ReconciliationWorkspacePage provider="WU" />
      </RoleGuard>
    ),
  },
  {
    path: 'reconciliation/journal/mg',
    element: (
      <RoleGuard allowedRoles={['director', 'accountant', 'auditor', 'branch']}>
        <ReconciliationWorkspacePage provider="MG" />
      </RoleGuard>
    ),
  },
];
