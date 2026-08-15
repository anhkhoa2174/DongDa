import { useMemo, type PropsWithChildren } from 'react';
import { hasBackendPermission, hasPermission } from '@/modules/auth/model/permissions';
import { useAuth } from '../auth/useAuth';
import { PermissionContext, type PermissionContextValue } from './permissionContext';

export function PermissionProvider({ children }: PropsWithChildren) {
  const { user } = useAuth();
  const value = useMemo<PermissionContextValue>(
    () => ({
      can: (permission) =>
        user?.permissions?.length
          ? hasBackendPermission(user.permissions, permission)
          : hasPermission(user?.role, permission),
    }),
    [user?.permissions, user?.role],
  );

  return <PermissionContext.Provider value={value}>{children}</PermissionContext.Provider>;
}
