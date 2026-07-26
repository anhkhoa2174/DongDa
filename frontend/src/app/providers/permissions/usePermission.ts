import { useContext } from 'react';
import { PermissionContext } from './permissionContext';

export function usePermission() {
  const permissions = useContext(PermissionContext);

  if (!permissions) {
    throw new Error('usePermission must be used within PermissionProvider');
  }

  return permissions;
}
