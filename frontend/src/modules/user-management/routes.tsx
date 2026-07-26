import { PermissionMatrixPage } from './pages/PermissionMatrixPage';
import { UsersPage } from './pages/UsersPage';

export const userManagementRoutes = [
  { path: 'user-management/users', element: <UsersPage /> },
  { path: 'user-management/permissions', element: <PermissionMatrixPage /> },
];
