import { createBrowserRouter, Navigate, RouterProvider } from 'react-router-dom';
import { AuthGuard } from '@/app/guards/AuthGuard';
import { AppLayout } from '@/app/layouts/AppLayout';
import { ForgotPasswordPage } from '@/modules/auth/pages/ForgotPasswordPage';
import { LoginPage } from '@/modules/auth/pages/LoginPage';
import { TwoFactorPage } from '@/modules/auth/pages/TwoFactorPage';
import { moduleRoutes } from './moduleRoutes';

const router = createBrowserRouter([
  { path: '/login', element: <LoginPage /> },
  { path: '/forgot-password', element: <ForgotPasswordPage /> },
  { path: '/two-factor', element: <TwoFactorPage /> },
  {
    path: '/',
    element: (
      <AuthGuard>
        <AppLayout />
      </AuthGuard>
    ),
    children: [
      { index: true, element: <Navigate to="/dashboard" replace /> },
      ...moduleRoutes,
    ],
  },
  {
    path: '*',
    element: <Navigate to="/" replace />,
  },
]);

export function AppRouter() {
  return <RouterProvider router={router} />;
}
