import { TransactionAccessGuard } from '@/modules/transactions/guards/TransactionAccessGuard';
import { WesternUnionTransactionsPage } from './pages/WesternUnionTransactionsPage';
import { WuWorkspacePage } from './pages/WuWorkspacePage';

export const westernUnionRoutes = [
  {
    path: 'western-union/transactions',
    element: (
      <TransactionAccessGuard>
        <WesternUnionTransactionsPage />
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
