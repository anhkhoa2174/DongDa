import { TransactionAccessGuard } from '@/modules/transactions/guards/TransactionAccessGuard';
import { MoneyGramTransactionsPage } from './pages/MoneyGramTransactionsPage';

export const moneyGramRoutes = [
  {
    path: 'moneygram/transactions',
    element: (
      <TransactionAccessGuard>
        <MoneyGramTransactionsPage />
      </TransactionAccessGuard>
    ),
  },
];
