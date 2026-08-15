import { TransactionAccessGuard } from '@/modules/transactions/guards/TransactionAccessGuard';
import { MgWorkspacePage } from './pages/MgWorkspacePage';

export const moneyGramRoutes = [
  {
    path: 'moneygram/transactions',
    element: (
      <TransactionAccessGuard>
        <MgWorkspacePage />
      </TransactionAccessGuard>
    ),
  },
  {
    path: 'moneygram/workspace',
    element: (
      <TransactionAccessGuard>
        <MgWorkspacePage />
      </TransactionAccessGuard>
    ),
  },
];
