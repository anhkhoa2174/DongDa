import { PageScaffold } from '@/shared/components/PageScaffold';
import { useAuthStore } from '@/modules/auth/model/auth.store';
import { BranchDashboardPage } from './BranchDashboardPage';
import { CompanyDashboardPage } from './CompanyDashboardPage';

type DashboardPageProps = {
  scope?: 'company' | 'branch';
};

export function DashboardPage({ scope }: DashboardPageProps) {
  const role = useAuthStore((state) => state.user?.role);
  const effectiveScope = scope ?? (role === 'branch' ? 'branch' : 'company');
  const title = effectiveScope === 'branch' ? 'Dashboard Chi Nhánh' : 'Dashboard Công Ty';
  const description = effectiveScope === 'branch'
    ? 'Theo dõi quỹ chi nhánh, ca làm việc và giao dịch trong phạm vi chi nhánh.'
    : 'Theo dõi tổng vốn, quỹ chung, công nợ, ngân hàng và cảnh báo toàn hệ thống.';

  return (
    <PageScaffold title={title} description={description} moduleName="dashboard">
      {effectiveScope === 'branch' ? <BranchDashboardPage /> : <CompanyDashboardPage />}
    </PageScaffold>
  );
}
