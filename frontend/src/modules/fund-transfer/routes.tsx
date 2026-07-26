import type { RouteObject } from 'react-router-dom';
import { FundTransferPage } from './pages/FundTransferPage';
import { FundTransferWorkspacePage } from './pages/FundTransferWorkspacePage';

export const fundTransferRoutes: RouteObject[] = [
  {
    path: 'fund-transfer',
    element: <FundTransferPage />,
  },
  {
    path: 'fund-transfer/workspace',
    element: <FundTransferWorkspacePage />,
  },
];
