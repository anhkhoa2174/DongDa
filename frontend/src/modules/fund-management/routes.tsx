import { Navigate } from 'react-router-dom';
import { RoleGuard } from '@/app/guards/RoleGuard';
import { BranchFundsPage, CentralFundPage } from './pages/FundManagementPage';
import { CentralFundMovementPage } from './pages/CentralFundMovementPage';

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
  {
    path: 'fund-management/central-fund/receipts',
    element: (
      <RoleGuard allowedRoles={['director', 'accountant']} requiredPermission="fund.view">
        <CentralFundMovementPage direction="IN" />
      </RoleGuard>
    ),
  },
  {
    path: 'fund-management/central-fund/expenses',
    element: (
      <RoleGuard allowedRoles={['director', 'accountant']} requiredPermission="fund.view">
        <CentralFundMovementPage direction="OUT" />
      </RoleGuard>
    ),
  },
  {
    path: 'fund-management/branch-funds/receipts',
    element: (
      <RoleGuard allowedRoles={['branch']} requiredPermission="fund.view">
        <CentralFundMovementPage direction="IN" scope="branch" />
      </RoleGuard>
    ),
  },
  {
    path: 'fund-management/branch-funds/expenses',
    element: (
      <RoleGuard allowedRoles={['branch']} requiredPermission="fund.view">
        <CentralFundMovementPage direction="OUT" scope="branch" />
      </RoleGuard>
    ),
  },
];
