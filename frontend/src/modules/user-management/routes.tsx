import { RoleGuard } from '@/app/guards/RoleGuard';
import { UsersPage } from './pages/UsersPage';

export const userManagementRoutes = [
  {
    path: 'user-management/users',
    element: <RoleGuard allowedRoles={['director']}><UsersPage /></RoleGuard>,
  },
];
