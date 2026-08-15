import { RoleGuard } from '@/app/guards/RoleGuard';
import { Navigate } from 'react-router-dom';
import { DebtSettlementPage } from './pages/DebtSettlementPage';

export const debtManagementRoutes = [
  {
    path: 'debt-management',
    element: (
      <RoleGuard allowedRoles={['director', 'accountant', 'auditor']} requiredPermission="debt.view">
        <DebtSettlementPage />
      </RoleGuard>
    ),
  },
  {
    path: 'debt-management/debt-list',
    element: <Navigate to="/debt-management" replace />,
  },
  {
    path: 'debt-management/settlement',
    element: <Navigate to="/debt-management" replace />,
  },
];
