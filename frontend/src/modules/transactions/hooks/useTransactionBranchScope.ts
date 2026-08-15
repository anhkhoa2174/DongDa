import type { FormInstance } from 'antd';
import { useEffect, useMemo } from 'react';
import { useAuthStore } from '@/modules/auth/model/auth.store';
import { useBranches } from '@/shared/hooks/useBranches';

export function useTransactionBranchScope(form: FormInstance) {
  const user = useAuthStore((state) => state.user);
  const { data: branches = [] } = useBranches();
  const isBranchUser = user?.role === 'branch';
  const isControlUser = user?.role === 'director' || user?.role === 'accountant';
  const canCreateTransaction = (isBranchUser && Boolean(user?.branchId)) || isControlUser;
  const branchOptions = useMemo(
    () => branches
      .filter((branch) => branch.type !== 'HEAD_OFFICE')
      .filter((branch) => !isBranchUser || branch.id === user?.branchId)
      .map((branch) => ({ value: branch.id, label: `${branch.code} — ${branch.name}` })),
    [branches, isBranchUser, user?.branchId],
  );

  useEffect(() => {
    if (isBranchUser && user?.branchId) form.setFieldValue('branchId', user.branchId);
  }, [form, isBranchUser, user?.branchId]);

  const resetBranchField = () => {
    if (isBranchUser && user?.branchId) form.setFieldValue('branchId', user.branchId);
  };

  return {
    user,
    branches,
    isBranchUser,
    isControlUser,
    canCreateTransaction,
    branchOptions,
    resetBranchField,
  };
}
