import type { PropsWithChildren } from 'react';
import { Navigate } from 'react-router-dom';
import { useAuthStore } from '@/modules/auth/model/auth.store';
import type { AppRole } from '@/modules/auth/model/auth.types';
import { hasBackendPermission, hasPermission, type Permission } from '@/modules/auth/model/permissions';

type RoleGuardProps = PropsWithChildren<{
  allowedRoles?: AppRole[];
  requiredPermission?: Permission;
}>;

export function RoleGuard({ allowedRoles, requiredPermission, children }: RoleGuardProps) {
  const user = useAuthStore((state) => state.user);
  const matchesRole = !allowedRoles || (user?.role && allowedRoles.includes(user.role));
  const matchesPermission = requiredPermission
    ? user?.permissions?.length
      ? hasBackendPermission(user.permissions, requiredPermission)
      : hasPermission(user?.role, requiredPermission)
    : true;

  if (!matchesRole || !matchesPermission) {
    return <Navigate to="/dashboard" replace />;
  }

  return <>{children}</>;
}
