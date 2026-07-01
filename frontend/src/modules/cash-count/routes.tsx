import { CashCountPage } from './pages/CashCountPage';
import { CentralAuditPage } from './pages/CentralAuditPage';

export const cashCountRoutes = [
  { path: 'cash-count/branch', element: <CashCountPage /> },
  { path: 'cash-count/central', element: <CentralAuditPage /> },
];
