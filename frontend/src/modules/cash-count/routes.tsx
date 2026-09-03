import { Navigate } from 'react-router-dom';

export const cashCountRoutes = [
  { path: 'cash-count/branch', element: <Navigate to="/shift-management/active-shift" replace /> },
  { path: 'cash-count/central', element: <Navigate to="/shift-management/active-shift" replace /> },
];
