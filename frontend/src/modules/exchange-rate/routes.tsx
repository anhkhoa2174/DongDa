import type { RouteObject } from 'react-router-dom';
import { RoleGuard } from '@/app/guards/RoleGuard';
import { ExchangeRateHistoryPage } from './pages/ExchangeRateHistoryPage';
import { ExchangeRatePage } from './pages/ExchangeRatePage';
import { ExchangeRateApprovalPage } from './pages/ExchangeRateApprovalPage';

export const exchangeRateRoutes: RouteObject[] = [
  { path: 'exchange-rate', element: <ExchangeRateApprovalPage /> },
  { path: 'exchange-rate/approval', element: <ExchangeRateApprovalPage /> },
  {
    path: 'exchange-rate/history',
    element: (
      <RoleGuard allowedRoles={['director', 'accountant', 'auditor']} requiredPermission="exchange_rate.view">
        <ExchangeRateHistoryPage />
      </RoleGuard>
    ),
  },
  { path: 'exchange-rate/wu-mg-rates', element: <ExchangeRatePage /> },
  { path: 'exchange-rate/fx-rates', element: <ExchangeRatePage /> },
];
