import { Navigate, type RouteObject } from 'react-router-dom';
import { RoleGuard } from '@/app/guards/RoleGuard';
import { FundTransferWorkspacePage } from './pages/FundTransferWorkspacePage';

const fundTransferPage = (
  <RoleGuard allowedRoles={['director', 'accountant', 'branch']} requiredPermission="fund.transfer">
    <FundTransferWorkspacePage />
  </RoleGuard>
);

export const fundTransferRoutes: RouteObject[] = [
  {
    path: 'fund-transfer',
    element: fundTransferPage,
  },
  {
    path: 'fund-transfer/workspace',
    element: <Navigate to="/fund-transfer" replace />,
  },
];
