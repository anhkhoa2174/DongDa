import type { AppRole } from './auth.store';

export type Permission =
  | 'exchange_rate.view'
  | 'exchange_rate.manage'
  | 'exchange_rate.approve'
  | 'fund.transfer'
  | 'fund.view'
  | 'audit_log.view'
  | 'bank.view'
  | 'debt.view'
  | 'report.view'
  | 'shift.close'
  | 'shift.open'
  | 'transaction.view'
  | 'transaction.create'
  | 'transaction.update_open'
  | 'transaction.void_open'
  | 'transaction.adjust_closed';

const backendPermissionMap: Record<Permission, string[]> = {
  'exchange_rate.view': ['exchange-rate:read'],
  'exchange_rate.manage': ['exchange-rate:manage'],
  'exchange_rate.approve': ['exchange-rate:approve'],
  'fund.transfer': ['capital-transfer:create'],
  'fund.view': ['capital-transfer:read'],
  'audit_log.view': ['audit-log:read'],
  'bank.view': ['capital-transfer:read'],
  'debt.view': ['capital-transfer:read'],
  'report.view': ['report:read'],
  'shift.close': ['shift:close'],
  'shift.open': ['shift:open'],
  'transaction.view': ['transaction:read'],
  'transaction.create': ['transaction:create'],
  'transaction.update_open': ['transaction:create'],
  'transaction.void_open': ['transaction:approve'],
  'transaction.adjust_closed': ['transaction:approve'],
};

const rolePermissions: Record<AppRole, Permission[]> = {
  director: ['exchange_rate.view', 'exchange_rate.manage', 'exchange_rate.approve', 'fund.transfer', 'fund.view', 'audit_log.view', 'bank.view', 'debt.view', 'report.view', 'shift.close', 'transaction.view', 'transaction.adjust_closed'],
  accountant: ['exchange_rate.view', 'exchange_rate.manage', 'fund.transfer', 'fund.view', 'bank.view', 'debt.view', 'report.view', 'shift.close', 'transaction.view', 'transaction.adjust_closed'],
  branch: ['exchange_rate.view', 'fund.view', 'shift.open', 'shift.close', 'transaction.view', 'transaction.create', 'transaction.update_open', 'transaction.void_open'],
  auditor: ['exchange_rate.view', 'fund.view', 'audit_log.view', 'bank.view', 'debt.view', 'report.view', 'transaction.view'],
};

export function hasPermission(role: AppRole | undefined, permission: Permission) {
  return role ? rolePermissions[role].includes(permission) : false;
}

export function hasBackendPermission(permissions: string[] | undefined, permission: Permission) {
  if (!permissions?.length) return false;
  if (permissions.includes('*')) return true;

  return backendPermissionMap[permission].some((backendPermission) => permissions.includes(backendPermission));
}
