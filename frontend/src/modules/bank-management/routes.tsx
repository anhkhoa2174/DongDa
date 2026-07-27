import { BankAccountMovementsPage } from './pages/BankAccountMovementsPage';
import { BankAccountsPage } from './pages/BankAccountsPage';
import { BankReceivePage } from './pages/BankReceivePage';

export const bankManagementRoutes = [
  {
    path: 'bank-management/accounts',
    element: <BankAccountsPage />,
  },
  {
    path: 'bank-management/receive',
    element: <BankReceivePage />,
  },
  {
    path: 'bank-management/accounts/:accountKey/movements',
    element: <BankAccountMovementsPage />,
  },
];
