import { RoleGuard } from '@/app/guards/RoleGuard';
import { Navigate } from 'react-router-dom';
import { BankAccountMovementsPage } from './pages/BankAccountMovementsPage';
import { BankAccountsPage } from './pages/BankAccountsPage';

export const bankManagementRoutes = [
  {
    path: 'bank-management/accounts',
    element: (
      <RoleGuard allowedRoles={['director', 'accountant', 'auditor']} requiredPermission="bank.view">
        <BankAccountsPage />
      </RoleGuard>
    ),
  },
  {
    path: 'bank-management/receive',
    element: <Navigate to="/debt-management" replace />,
  },
  {
    path: 'bank-management/accounts/:accountKey/movements',
    element: (
      <RoleGuard allowedRoles={['director', 'accountant', 'auditor']} requiredPermission="bank.view">
        <BankAccountMovementsPage />
      </RoleGuard>
    ),
  },
];
