import { TransactionAccessGuard } from '@/modules/transactions/guards/TransactionAccessGuard';
import { DomesticTransferTransactionsPage } from './pages/DomesticTransferTransactionsPage';

export const domesticTransferRoutes = [
  {
    path: 'domestic-transfer/transactions',
    element: (
      <TransactionAccessGuard>
        <DomesticTransferTransactionsPage />
      </TransactionAccessGuard>
    ),
  },
];
