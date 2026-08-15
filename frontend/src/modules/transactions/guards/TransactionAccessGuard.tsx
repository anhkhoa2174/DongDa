import { Button, Result, Spin } from 'antd';
import type { PropsWithChildren } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuthStore } from '@/modules/auth/model/auth.store';
import { useTransactionShift } from '../hooks/useTransactionShift';
import { getTransactionAccess } from '../model/transactionAccess';

export function TransactionAccessGuard({ children }: PropsWithChildren) {
  const navigate = useNavigate();
  const user = useAuthStore((state) => state.user);
  const role = user?.role;
  const branchId = user?.branchId;
  const { currentShift, isLoading } = useTransactionShift();
  const access = getTransactionAccess(role, currentShift);

  if (role === 'branch' && branchId && isLoading) {
    return <Spin />;
  }

  if (access.mode === 'NO_SHIFT') {
    return (
      <Result
        status="warning"
        title="Cần mở ca trước khi tạo giao dịch"
        subTitle="Staff chỉ được tạo WU, MG và mua/bán ngoại tệ sau khi xác nhận tồn hệ thống và mở ca."
        extra={(
          <Button type="primary" onClick={() => navigate('/shift-management/active-shift')}>
            Mở ca
          </Button>
        )}
      />
    );
  }

  return children;
}
