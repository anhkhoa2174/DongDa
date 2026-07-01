import type { RouteObject } from 'react-router-dom';
import { FundTransferPage } from './pages/FundTransferPage';

export const fundTransferRoutes: RouteObject[] = [
  {
    path: 'fund-transfer',
    element: <FundTransferPage />,
  },
];
