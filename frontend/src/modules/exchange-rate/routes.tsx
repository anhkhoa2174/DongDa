import type { RouteObject } from 'react-router-dom';
import { ExchangeRateHistoryPage } from './pages/ExchangeRateHistoryPage';
import { ExchangeRatePage } from './pages/ExchangeRatePage';
import { ExchangeRateApprovalPage } from './pages/ExchangeRateApprovalPage';

export const exchangeRateRoutes: RouteObject[] = [
  { path: 'exchange-rate', element: <ExchangeRatePage /> },
  { path: 'exchange-rate/approval', element: <ExchangeRateApprovalPage /> },
  { path: 'exchange-rate/history', element: <ExchangeRateHistoryPage /> },
  { path: 'exchange-rate/wu-mg-rates', element: <ExchangeRatePage /> },
  { path: 'exchange-rate/fx-rates', element: <ExchangeRatePage /> },
];
