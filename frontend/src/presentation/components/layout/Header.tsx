// Header — hiển thị user + logout
import { useAuthStore } from '@application/stores/auth.store';
import { useLogout } from '@application/hooks/useAuth';
import { LogOut } from 'lucide-react';

export function Header() {
  const user = useAuthStore((s) => s.user);
  const logout = useLogout();

  return (
    <header className="h-14 bg-white border-b border-gray-200 flex items-center justify-between px-6">
      <span className="text-sm text-gray-500">
        {user?.role && <span className="font-medium text-gray-700">[{user.role}]</span>}
      </span>
      <div className="flex items-center gap-3">
        <span className="text-sm font-medium text-gray-700">{user?.fullName}</span>
        <button
          onClick={() => logout.mutate()}
          className="flex items-center gap-1 text-sm text-gray-500 hover:text-red-600 transition"
        >
          <LogOut className="w-4 h-4" />
          Đăng xuất
        </button>
      </div>
    </header>
  );
}
