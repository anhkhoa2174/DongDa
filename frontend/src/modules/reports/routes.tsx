import { ReportsPage } from './pages/ReportsPage';
import { ReportsLivePage } from './pages/ReportsLivePage';

export const reportsRoutes = [
  { path: 'reports', element: <ReportsPage /> },
  { path: 'reports/summary', element: <ReportsLivePage /> },
];
