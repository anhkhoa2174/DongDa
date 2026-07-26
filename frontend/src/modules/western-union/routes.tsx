import { TransactionAccessGuard } from '@/modules/transactions/guards/TransactionAccessGuard';
import { WesternUnionTransactionsPage } from './pages/WesternUnionTransactionsPage';

export const westernUnionRoutes = [
  {
    path: 'western-union/transactions',
    element: (
      <TransactionAccessGuard>
        <WesternUnionTransactionsPage />
      </TransactionAccessGuard>
    ),
  },
];
