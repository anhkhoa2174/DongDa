import { Navigate } from 'react-router-dom';
import { RoleGuard } from '@/app/guards/RoleGuard';
import { ShiftWorkspacePage } from './pages/ShiftWorkspacePage';

export const shiftManagementRoutes = [
  {
    path: 'shift-management/active-shift',
    element: (
      <RoleGuard allowedRoles={['branch']} requiredPermission="shift.open">
        <ShiftWorkspacePage />
      </RoleGuard>
    ),
  },
  { path: 'shift-management/open-shift', element: <Navigate to="/shift-management/active-shift" replace /> },
  { path: 'shift-management/close-shift', element: <Navigate to="/shift-management/active-shift" replace /> },
];
