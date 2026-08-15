import { TransactionAccessGuard } from '@/modules/transactions/guards/TransactionAccessGuard';
import { FxWorkspacePage } from './pages/FxWorkspacePage';

export const foreignExchangeRoutes = [
  {
    path: 'foreign-exchange/trading',
    element: (
      <TransactionAccessGuard>
        <FxWorkspacePage />
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
