import { RoleGuard } from '@/app/guards/RoleGuard';
import { ReconciliationPage } from './pages/ReconciliationPage';
import { ReconciliationWorkspacePage } from './pages/ReconciliationWorkspacePage';

export const reconciliationRoutes = [
  {
    path: 'reconciliation',
    element: (
      <RoleGuard allowedRoles={['director', 'accountant', 'auditor']}>
        <ReconciliationPage />
      </RoleGuard>
    ),
  },
  // Chi nhánh upload Journal + đối chiếu cho chính mình; GĐ/KTTH/kiểm toán xem toàn công ty hoặc từng chi nhánh.
  {
    path: 'reconciliation/journal',
    element: (
      <RoleGuard allowedRoles={['director', 'accountant', 'auditor', 'branch']}>
        <ReconciliationWorkspacePage />
      </RoleGuard>
    ),
  },
];
