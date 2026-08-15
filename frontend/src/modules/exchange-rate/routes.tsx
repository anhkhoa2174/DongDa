import type { RouteObject } from 'react-router-dom';
import { Navigate } from 'react-router-dom';
import { RoleGuard } from '@/app/guards/RoleGuard';
import { ExchangeRateHistoryPage } from './pages/ExchangeRateHistoryPage';
import { ExchangeRateApprovalPage } from './pages/ExchangeRateApprovalPage';

export const exchangeRateRoutes: RouteObject[] = [
  { path: 'exchange-rate', element: <ExchangeRateApprovalPage /> },
  { path: 'exchange-rate/approval', element: <Navigate to="/exchange-rate" replace /> },
  {
    path: 'exchange-rate/history',
    element: (
      <RoleGuard allowedRoles={['director', 'accountant', 'auditor']} requiredPermission="exchange_rate.view">
        <ExchangeRateHistoryPage />
      </RoleGuard>
    ),
  },
  { path: 'exchange-rate/wu-mg-rates', element: <Navigate to="/exchange-rate" replace /> },
  { path: 'exchange-rate/fx-rates', element: <Navigate to="/exchange-rate" replace /> },
];
