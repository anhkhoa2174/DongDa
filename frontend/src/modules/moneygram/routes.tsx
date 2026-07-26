import { TransactionAccessGuard } from '@/modules/transactions/guards/TransactionAccessGuard';
import { MoneyGramTransactionsPage } from './pages/MoneyGramTransactionsPage';
import { MgWorkspacePage } from './pages/MgWorkspacePage';

export const moneyGramRoutes = [
  {
    path: 'moneygram/transactions',
    element: (
      <TransactionAccessGuard>
        <MoneyGramTransactionsPage />
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
