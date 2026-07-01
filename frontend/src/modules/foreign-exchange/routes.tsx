import { TransactionAccessGuard } from '@/modules/transactions/guards/TransactionAccessGuard';
import { ForeignExchangeTransactionsPage } from './pages/ForeignExchangeTransactionsPage';

export const foreignExchangeRoutes = [
  {
    path: 'foreign-exchange/trading',
    element: (
      <TransactionAccessGuard>
        <ForeignExchangeTransactionsPage />
      </TransactionAccessGuard>
    ),
  },
];
