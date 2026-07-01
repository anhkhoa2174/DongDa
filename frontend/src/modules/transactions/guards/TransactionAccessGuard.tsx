import { Alert, Button } from 'antd';
import type { PropsWithChildren } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuthStore } from '@/modules/auth/model/auth.store';
import { useShiftStore } from '@/modules/shift-management/model/shift.store';
import { isUiTestMode } from '@/shared/config/runtime';
import { getTransactionAccess } from '../model/transactionAccess';

export function TransactionAccessGuard({ children }: PropsWithChildren) {
  const navigate = useNavigate();
  const role = useAuthStore((state) => state.user?.role);
  const currentShift = useShiftStore((state) => state.currentShift);
  const access = getTransactionAccess(role, currentShift);

  const banner = {
    OPEN_SHIFT: {
      type: 'success' as const,
      message: `Ca ${currentShift?.code} đang mở`,
      description: 'Mọi giao dịch mới sẽ tự động được gắn vào ca hiện tại.',
    },
    CLOSED_SHIFT: {
      type: 'warning' as const,
      message: 'Ca đã đóng - giao dịch đang ở chế độ chỉ xem',
      description: 'Không thể tạo, sửa hoặc void giao dịch. Liên hệ KTTH/GĐ nếu cần điều chỉnh có audit.',
    },
    NO_SHIFT: {
      type: 'warning' as const,
      message: 'Vui lòng mở ca trước khi tạo giao dịch',
      description: 'Không có ca OPEN tại chi nhánh. Backend sẽ từ chối với mã SHIFT_NOT_OPEN.',
    },
    CONTROL_READ_ONLY: {
      type: 'info' as const,
      message: 'Chế độ kiểm soát - không trực tiếp tạo giao dịch',
      description: 'KTTH/GĐ chỉ được xem; sau khi ca đóng có thể tạo adjustment kèm lý do bắt buộc.',
    },
    AUDIT_READ_ONLY: {
      type: 'info' as const,
      message: 'Chế độ chỉ đọc',
      description: 'Kiểm toán viên không được tạo, sửa, void hoặc điều chỉnh giao dịch.',
    },
  }[access.mode];

  return (
    <div className="space-y-4">
      {isUiTestMode && (
        <Alert
          showIcon
          type="warning"
          message="UI/UX test mode đang bật"
          description="Các action giao dịch được enable trong development. Production vẫn áp dụng đầy đủ shift và permission policy."
        />
      )}
      <Alert
        showIcon
        type={banner.type}
        message={banner.message}
        description={banner.description}
        action={
          access.mode === 'NO_SHIFT' ? (
            <Button size="small" type="primary" onClick={() => navigate('/shift-management/open-shift')}>
              Mở ca
            </Button>
          ) : undefined
        }
      />
      {children}
    </div>
  );
}
