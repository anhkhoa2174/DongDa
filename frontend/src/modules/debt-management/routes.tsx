import { RoleGuard } from '@/app/guards/RoleGuard';
import { DebtManagementPage } from './pages/DebtManagementPage';
import { DebtSettlementPage } from './pages/DebtSettlementPage';

export const debtManagementRoutes = [
  {
    path: 'debt-management/debt-list',
    element: (
      <RoleGuard allowedRoles={['director', 'accountant', 'auditor']} requiredPermission="debt.view">
        <DebtManagementPage />
      </RoleGuard>
    ),
  },
  {
    path: 'debt-management/settlement',
    element: (
      <RoleGuard allowedRoles={['director', 'accountant', 'auditor']} requiredPermission="debt.view">
        <DebtSettlementPage />
      </RoleGuard>
    ),
  },
];
