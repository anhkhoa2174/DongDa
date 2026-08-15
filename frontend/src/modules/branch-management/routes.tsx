import type { RouteObject } from 'react-router-dom';
import { RoleGuard } from '@/app/guards/RoleGuard';
import { BranchMonitoringPage } from './pages/BranchMonitoringPage';

export const branchManagementRoutes: RouteObject[] = [
  {
    path: 'branch-management/monitoring',
    element: (
      <RoleGuard allowedRoles={['director', 'accountant']} requiredPermission="fund.view">
        <BranchMonitoringPage />
      </RoleGuard>
    ),
  },
];
