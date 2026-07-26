import { TransactionAccessGuard } from '@/modules/transactions/guards/TransactionAccessGuard';
import { ForeignExchangeTransactionsPage } from './pages/ForeignExchangeTransactionsPage';
import { FxWorkspacePage } from './pages/FxWorkspacePage';

export const foreignExchangeRoutes = [
  {
    path: 'foreign-exchange/trading',
    element: (
      <TransactionAccessGuard>
        <ForeignExchangeTransactionsPage />
      </TransactionAccessGuard>
    ),
  },
  {
    path: 'foreign-exchange/workspace',
    element: (
      <TransactionAccessGuard>
        <FxWorkspacePage />
      </TransactionAccessGuard>
    ),
  },
];
