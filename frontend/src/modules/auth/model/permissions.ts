import type { AppRole } from './auth.store';

export type Permission =
  | 'exchange_rate.view'
  | 'exchange_rate.manage'
  | 'exchange_rate.approve'
  | 'transaction.view'
  | 'transaction.create'
  | 'transaction.update_open'
  | 'transaction.void_open'
  | 'transaction.adjust_closed';

const rolePermissions: Record<AppRole, Permission[]> = {
  director: ['exchange_rate.view', 'exchange_rate.manage', 'exchange_rate.approve', 'transaction.view', 'transaction.adjust_closed'],
  accountant: ['exchange_rate.view', 'exchange_rate.manage', 'transaction.view', 'transaction.adjust_closed'],
  branch: ['exchange_rate.view', 'transaction.view', 'transaction.create', 'transaction.update_open', 'transaction.void_open'],
  auditor: ['exchange_rate.view', 'transaction.view'],
};

export function hasPermission(role: AppRole | undefined, permission: Permission) {
  return role ? rolePermissions[role].includes(permission) : false;
}
