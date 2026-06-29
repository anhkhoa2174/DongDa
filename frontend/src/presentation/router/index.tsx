// Router — React Router v6
// Layer: Presentation

import { createBrowserRouter, Navigate } from 'react-router-dom';
import { LoginPage } from '../pages/auth/LoginPage';
import { PrivateRoute } from './PrivateRoute';
import { AppLayout } from '../components/layout/AppLayout';
import { DashboardPage } from '../pages/dashboard/DashboardPage';

export const router = createBrowserRouter([
  {
    path: '/login',
    element: <LoginPage />,
  },
  {
    path: '/',
    element: (
      <PrivateRoute>
        <AppLayout />
      </PrivateRoute>
    ),
    children: [
      { index: true, element: <Navigate to="/dashboard" replace /> },
      { path: 'dashboard', element: <DashboardPage /> },
    ],
  },
]);
