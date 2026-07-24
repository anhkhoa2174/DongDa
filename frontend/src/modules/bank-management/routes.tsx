import { BankAccountMovementsPage } from './pages/BankAccountMovementsPage';
import { BankAccountsPage } from './pages/BankAccountsPage';

export const bankManagementRoutes = [
  {
    path: 'bank-management/accounts',
    element: <BankAccountsPage />,
  },
  {
    path: 'bank-management/accounts/:accountKey/movements',
    element: <BankAccountMovementsPage />,
  },
];
