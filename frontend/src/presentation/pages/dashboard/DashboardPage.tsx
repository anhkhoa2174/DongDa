// Dashboard placeholder
import { useAuthStore } from '@application/stores/auth.store';

export function DashboardPage() {
  const user = useAuthStore((s) => s.user);

  return (
    <div>
      <h1 className="text-xl font-semibold text-gray-900">Dashboard</h1>
      <p className="text-gray-500 mt-1">Xin chào, {user?.fullName}</p>
    </div>
  );
}
