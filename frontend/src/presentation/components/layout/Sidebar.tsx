// Sidebar placeholder
import { LayoutDashboard } from 'lucide-react';
import { NavLink } from 'react-router-dom';
import { useAuthStore } from '@application/stores/auth.store';

export function Sidebar() {
  const user = useAuthStore((s) => s.user);

  return (
    <aside className="w-64 bg-slate-900 text-slate-300 flex flex-col">
      <div className="p-5 border-b border-slate-800">
        <div className="flex items-center gap-2">
          <div className="w-8 h-8 bg-blue-600 rounded-lg flex items-center justify-center text-white font-bold">Đ</div>
          <div>
            <div className="text-white font-semibold text-sm">CTY Đống Đa</div>
            <div className="text-xs text-slate-400">{user?.fullName}</div>
          </div>
        </div>
      </div>
      <nav className="flex-1 p-3 space-y-1">
        <NavLink
          to="/dashboard"
          className={({ isActive }) =>
            `flex items-center gap-3 px-3 py-2 rounded-md text-sm transition ${
              isActive ? 'bg-blue-700 text-white' : 'hover:bg-slate-800'
            }`
          }
        >
          <LayoutDashboard className="w-4 h-4" />
          Dashboard
        </NavLink>
      </nav>
    </aside>
  );
}
