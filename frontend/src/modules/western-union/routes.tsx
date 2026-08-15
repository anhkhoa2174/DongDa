import { TransactionAccessGuard } from '@/modules/transactions/guards/TransactionAccessGuard';
import { WuWorkspacePage } from './pages/WuWorkspacePage';

export const westernUnionRoutes = [
  {
    path: 'western-union/transactions',
    element: (
      <TransactionAccessGuard>
        <WuWorkspacePage />
      </TransactionAccessGuard>
    ),
  },
  {
    path: 'western-union/workspace',
    element: (
      <TransactionAccessGuard>
        <WuWorkspacePage />
      </TransactionAccessGuard>
    ),
  },
];
