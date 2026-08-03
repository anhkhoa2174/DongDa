import { Navigate } from 'react-router-dom';
import { RoleGuard } from '@/app/guards/RoleGuard';
import { BranchFundsPage, CentralFundPage } from './pages/FundManagementPage';

export const fundManagementRoutes = [
  {
    path: 'fund-management/branch-monitoring',
    element: <Navigate to="/branch-management/monitoring" replace />,
  },
  {
    path: 'fund-management/branch-funds',
    element: (
      <RoleGuard allowedRoles={['director', 'accountant', 'auditor', 'branch']}>
        <BranchFundsPage />
      </RoleGuard>
    ),
  },
  {
    path: 'fund-management/central-fund',
    element: (
      <RoleGuard allowedRoles={['director', 'accountant', 'auditor']} requiredPermission="fund.view">
        <CentralFundPage />
      </RoleGuard>
    ),
  },
];
