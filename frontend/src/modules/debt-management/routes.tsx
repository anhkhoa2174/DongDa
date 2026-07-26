import { DebtManagementPage } from './pages/DebtManagementPage';
import { DebtSettlementPage } from './pages/DebtSettlementPage';

export const debtManagementRoutes = [
  {
    path: 'debt-management/debt-list',
    element: <DebtManagementPage />,
  },
  {
    path: 'debt-management/settlement',
    element: <DebtSettlementPage />,
  },
];
