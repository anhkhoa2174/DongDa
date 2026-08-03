import { useMemo } from 'react';
import { useAuthStore } from '@/modules/auth/model/auth.store';
import { useCurrentShift } from '@/modules/shift-management/hooks/useShift';

export function useTransactionShift() {
  const user = useAuthStore((state) => state.user);
  const isBranchUser = user?.role === 'branch';
  const query = useCurrentShift(isBranchUser ? user?.branchId : undefined);
  const currentShift = useMemo(() => {
    const shift = query.data?.shift;
    if (!shift) return null;
    return {
      id: shift.id,
      code: shift.shiftCode,
      branchId: shift.branchId,
      branchName: user?.branchName ?? 'Chi nhánh đang làm việc',
      openedBy: user?.name ?? '',
      openedAt: shift.openedAt,
      closedBy: null,
      closedAt: shift.closedAt ?? null,
      status: shift.status as 'OPEN' | 'CLOSED',
    };
  }, [query.data?.shift, user?.branchName, user?.name]);

  return {
    currentShift,
    isLoading: isBranchUser && Boolean(user?.branchId) && query.isLoading,
  };
}
