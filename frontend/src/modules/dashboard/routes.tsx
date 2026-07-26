import { Navigate, type RouteObject } from 'react-router-dom';
import { DashboardPage } from './pages/DashboardPage';

export const dashboardRoutes: RouteObject[] = [
  {
    path: 'dashboard',
    element: <DashboardPage />,
  },
  {
    path: 'dashboard/company',
    element: <Navigate to="/dashboard" replace />,
  },
  {
    path: 'dashboard/director',
    element: <Navigate to="/dashboard" replace />,
  },
  {
    path: 'dashboard/ktth',
    element: <Navigate to="/dashboard" replace />,
  },
  {
    path: 'dashboard/branch',
    element: <Navigate to="/dashboard" replace />,
  },
];
