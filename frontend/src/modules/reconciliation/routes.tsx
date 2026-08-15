import { ReconciliationPage } from './pages/ReconciliationPage';
import { ReconciliationWorkspacePage } from './pages/ReconciliationWorkspacePage';

export const reconciliationRoutes = [
  { path: 'reconciliation', element: <ReconciliationPage /> },
  { path: 'reconciliation/journal', element: <ReconciliationWorkspacePage /> },
];
