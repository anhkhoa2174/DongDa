import { RoleGuard } from '@/app/guards/RoleGuard';
import { PermissionMatrixPage } from './pages/PermissionMatrixPage';
import { UsersPage } from './pages/UsersPage';

export const userManagementRoutes = [
  {
    path: 'user-management/users',
    element: <RoleGuard allowedRoles={['director']}><UsersPage /></RoleGuard>,
  },
  {
    path: 'user-management/permissions',
    element: <RoleGuard allowedRoles={['director']}><PermissionMatrixPage /></RoleGuard>,
  },
];
