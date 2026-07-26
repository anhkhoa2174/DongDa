import type { RouteObject } from 'react-router-dom';
import { BranchMonitoringPage } from './pages/BranchMonitoringPage';

export const branchManagementRoutes: RouteObject[] = [
  {
    path: 'branch-management/monitoring',
    element: <BranchMonitoringPage />,
  },
];
