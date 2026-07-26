import type { AppRole } from '@/modules/auth/model/auth.store';
import { hasPermission } from '@/modules/auth/model/permissions';
import type { Shift } from '@/modules/shift-management/model/shift.store';

export type TransactionAccess = {
  canView: boolean;
  canCreate: boolean;
  canUpdate: boolean;
  canVoid: boolean;
  canDelete: false;
  canAdjustClosed: boolean;
  adjustmentReasonRequired: boolean;
  mode: 'OPEN_SHIFT' | 'CLOSED_SHIFT' | 'NO_SHIFT' | 'CONTROL_READ_ONLY' | 'AUDIT_READ_ONLY';
};

export function getTransactionAccess(role: AppRole | undefined, shift: Shift | null): TransactionAccess {
  const isOpen = shift?.status === 'OPEN';
  const isClosed = shift?.status === 'CLOSED';
  const isBranch = role === 'branch';
  const isControl = role === 'director' || role === 'accountant';

  return {
    canView: hasPermission(role, 'transaction.view'),
    canCreate: isBranch && isOpen && hasPermission(role, 'transaction.create'),
    canUpdate: isBranch && isOpen && hasPermission(role, 'transaction.update_open'),
    canVoid: isBranch && isOpen && hasPermission(role, 'transaction.void_open'),
    canDelete: false,
    canAdjustClosed: isControl && isClosed && hasPermission(role, 'transaction.adjust_closed'),
    adjustmentReasonRequired: isControl && isClosed,
    mode: isBranch
      ? isOpen
        ? 'OPEN_SHIFT'
        : isClosed
          ? 'CLOSED_SHIFT'
          : 'NO_SHIFT'
      : isControl
        ? 'CONTROL_READ_ONLY'
        : 'AUDIT_READ_ONLY',
  };
}
