import {
  BankOutlined,
  IdcardOutlined,
  LockOutlined,
  MailOutlined,
  SafetyCertificateOutlined,
  UserOutlined,
} from '@ant-design/icons';
import { useMutation, useQuery } from '@tanstack/react-query';
import { App, Avatar, Button, Card, Col, Form, Input, Row, Space, Spin, Tag, Typography } from 'antd';
import axios from 'axios';
import type { ReactNode } from 'react';
import { changePasswordWithApi, getCurrentUser } from '../api/auth.api';
import { useAuthStore } from '../model/auth.store';
import type { AuthUser } from '../model/auth.types';
import { PageScaffold } from '@/shared/components/PageScaffold';

type PasswordFormValues = {
  currentPassword: string;
  newPassword: string;
  confirmPassword: string;
};

const roleLabels: Record<AuthUser['role'], string> = {
  director: 'Giám đốc',
  accountant: 'Kế toán tổng hợp',
  branch: 'Nhân viên chi nhánh',
  auditor: 'Kiểm toán viên',
};

function getErrorMessage(error: unknown) {
  if (axios.isAxiosError(error)) {
    const responseMessage = error.response?.data?.message;
    return Array.isArray(responseMessage)
      ? responseMessage.join(', ')
      : responseMessage || 'Không thể đổi mật khẩu';
  }
  return 'Không thể đổi mật khẩu';
}

export function ProfilePage() {
  const { message } = App.useApp();
  const [form] = Form.useForm<PasswordFormValues>();
  const storedUser = useAuthStore((state) => state.user);
  const profileQuery = useQuery({
    queryKey: ['auth', 'me'],
    queryFn: getCurrentUser,
    staleTime: 60_000,
  });
  const profile = profileQuery.data ?? storedUser;
  const changePassword = useMutation({
    mutationFn: changePasswordWithApi,
    onSuccess: () => {
      form.resetFields();
      message.success('Đổi mật khẩu thành công');
    },
    onError: (error) => message.error(getErrorMessage(error)),
  });

  const submitPassword = async () => {
    const values = await form.validateFields();
    changePassword.mutate({
      currentPassword: values.currentPassword,
      newPassword: values.newPassword,
    });
  };

  return (
    <PageScaffold
      title="Hồ sơ cá nhân"
      description="Thông tin tài khoản và bảo mật đăng nhập của bạn."
      moduleName="profile"
    >
      <Spin spinning={profileQuery.isLoading && !profile}>
        <div className="mb-4 flex items-center gap-4 rounded-lg bg-neutral-950 px-6 py-5 text-white shadow-sm">
          <Avatar size={56} className="shrink-0 bg-amber-400! text-xl! font-bold! text-neutral-950!">
            {profile?.name?.trim().charAt(0).toUpperCase() || <UserOutlined />}
          </Avatar>
          <div className="min-w-0">
            <Typography.Title level={2} className="m-0! truncate text-white!">
              {profile?.name || 'Người dùng'}
            </Typography.Title>
            <Space size={8} wrap>
              <Typography.Text className="text-neutral-300!">@{profile?.username || '---'}</Typography.Text>
              {profile && <Tag color="gold">{roleLabels[profile.role]}</Tag>}
            </Space>
          </div>
        </div>

        <Row gutter={[16, 16]} align="stretch">
          <Col xs={24} lg={12}>
            <Card title={<Space><IdcardOutlined />Thông tin tài khoản</Space>} className="h-full shadow-sm">
              <Space direction="vertical" size={20} className="w-full">
                <ProfileField icon={<UserOutlined />} label="Tên đăng nhập" value={profile?.username} />
                <ProfileField icon={<IdcardOutlined />} label="Họ và tên" value={profile?.name} />
                <ProfileField icon={<MailOutlined />} label="Email" value={profile?.email || 'Chưa cập nhật'} />
                <ProfileField
                  icon={<BankOutlined />}
                  label="Đơn vị làm việc"
                  value={profile?.branchName || (profile?.role === 'branch' ? 'Chưa xác định' : 'Toàn hệ thống')}
                />
                <ProfileField
                  icon={<SafetyCertificateOutlined />}
                  label="Vai trò"
                  value={profile ? roleLabels[profile.role] : undefined}
                />
              </Space>
            </Card>
          </Col>

          <Col xs={24} lg={12}>
            <Card
              id="security"
              title={<Space><LockOutlined />Đổi mật khẩu</Space>}
              className="h-full shadow-sm"
            >
              <Form form={form} layout="vertical" requiredMark="optional" onFinish={submitPassword}>
                <Form.Item
                  name="currentPassword"
                  label="Mật khẩu hiện tại"
                  rules={[{ required: true, message: 'Vui lòng nhập mật khẩu hiện tại' }]}
                >
                  <Input.Password autoComplete="current-password" />
                </Form.Item>
                <Form.Item
                  name="newPassword"
                  label="Mật khẩu mới"
                  extra="Tối thiểu 6 ký tự."
                  rules={[
                    { required: true, message: 'Vui lòng nhập mật khẩu mới' },
                    { min: 6, message: 'Mật khẩu phải có ít nhất 6 ký tự' },
                  ]}
                >
                  <Input.Password autoComplete="new-password" />
                </Form.Item>
                <Form.Item
                  name="confirmPassword"
                  label="Xác nhận mật khẩu mới"
                  dependencies={['newPassword']}
                  rules={[
                    { required: true, message: 'Vui lòng xác nhận mật khẩu mới' },
                    ({ getFieldValue }) => ({
                      validator(_, value) {
                        return !value || getFieldValue('newPassword') === value
                          ? Promise.resolve()
                          : Promise.reject(new Error('Mật khẩu xác nhận không khớp'));
                      },
                    }),
                  ]}
                >
                  <Input.Password autoComplete="new-password" />
                </Form.Item>
                <Button
                  type="primary"
                  htmlType="submit"
                  icon={<LockOutlined />}
                  loading={changePassword.isPending}
                >
                  Cập nhật mật khẩu
                </Button>
              </Form>
            </Card>
          </Col>
        </Row>
      </Spin>
    </PageScaffold>
  );
}

function ProfileField({ icon, label, value }: { icon: ReactNode; label: string; value?: string }) {
  return (
    <div className="flex items-start gap-3 border-b border-slate-100 pb-4 last:border-b-0 last:pb-0">
      <div className="flex size-9 shrink-0 items-center justify-center rounded-md bg-amber-50 text-amber-700">
        {icon}
      </div>
      <div className="min-w-0">
        <Typography.Text type="secondary" className="block text-xs!">{label}</Typography.Text>
        <Typography.Text strong className="break-words">{value || '---'}</Typography.Text>
      </div>
    </div>
  );
}
