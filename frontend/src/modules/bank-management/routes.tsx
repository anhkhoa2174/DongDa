import { RoleGuard } from '@/app/guards/RoleGuard';
import { BankAccountMovementsPage } from './pages/BankAccountMovementsPage';
import { BankAccountsPage } from './pages/BankAccountsPage';
import { BankReceivePage } from './pages/BankReceivePage';

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
    element: (
      <RoleGuard allowedRoles={['director', 'accountant']} requiredPermission="bank.view">
        <BankReceivePage />
      </RoleGuard>
    ),
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
