import {
  CheckCircleOutlined,
  ExclamationCircleOutlined,
  KeyOutlined,
  LockOutlined,
  PlusOutlined,
  SafetyOutlined,
  UnlockOutlined,
  UserOutlined,
} from '@ant-design/icons';
import { Button, Card, Col, Input, Row, Select, Space, Statistic, Table, Tag, Typography } from 'antd';
import type { ColumnsType } from 'antd/es/table';
import { useMemo, useState } from 'react';
import { PageScaffold } from '@/shared/components/PageScaffold';
import { formatDateTime } from '@/shared/utils/formatters';
import { activityLogsMock, usersMock } from '../data/users.mock';
import type { AppUser, UserRoleCode, UserStatus } from '../model/user.types';

const roleMeta: Record<UserRoleCode, { label: string; color: string }> = {
  ADMIN: { label: 'Admin', color: 'red' },
  MANAGER: { label: 'Quản lý/KTTH', color: 'blue' },
  STAFF: { label: 'Nhân viên CN', color: 'default' },
  AUDITOR: { label: 'Auditor', color: 'purple' },
};

const statusMeta: Record<UserStatus, { label: string; color: string; icon: JSX.Element }> = {
  ACTIVE: { label: 'Hoạt động', color: 'green', icon: <CheckCircleOutlined /> },
  LOCKED: { label: 'Đã khóa', color: 'red', icon: <LockOutlined /> },
  DISABLED: { label: 'Vô hiệu', color: 'default', icon: <ExclamationCircleOutlined /> },
};

const roleFilterOptions = [
  { value: 'ALL', label: 'Tất cả vai trò' },
  ...Object.entries(roleMeta).map(([value, meta]) => ({ value, label: meta.label })),
];

const statusFilterOptions = [
  { value: 'ALL', label: 'Tất cả trạng thái' },
  { value: 'ACTIVE', label: 'Hoạt động' },
  { value: 'LOCKED', label: 'Đã khóa' },
  { value: 'DISABLED', label: 'Vô hiệu' },
];

export function UsersPage() {
  const [search, setSearch] = useState('');
  const [roleFilter, setRoleFilter] = useState<string>('ALL');
  const [statusFilter, setStatusFilter] = useState<string>('ALL');

  const filtered = useMemo(() => {
    return usersMock.filter((u) => {
      const matchSearch =
        !search ||
        u.username.toLowerCase().includes(search.toLowerCase()) ||
        u.fullName.toLowerCase().includes(search.toLowerCase()) ||
        u.email.toLowerCase().includes(search.toLowerCase());
      const matchRole = roleFilter === 'ALL' || u.role === roleFilter;
      const matchStatus = statusFilter === 'ALL' || u.status === statusFilter;
      return matchSearch && matchRole && matchStatus;
    });
  }, [search, roleFilter, statusFilter]);

  const stats = useMemo(() => {
    const total = usersMock.length;
    const active = usersMock.filter((u) => u.status === 'ACTIVE').length;
    const locked = usersMock.filter((u) => u.status === 'LOCKED').length;
    const twoFa = usersMock.filter((u) => u.twoFactorEnabled).length;
    return { total, active, locked, twoFa };
  }, []);

  const columns: ColumnsType<AppUser> = [
    {
      title: 'Người dùng',
      key: 'user',
      render: (_, u) => (
        <div className="flex items-center gap-3">
          <div className="flex h-9 w-9 items-center justify-center rounded-full bg-blue-50 text-blue-600">
            <UserOutlined />
          </div>
          <div className="min-w-0">
            <div className="font-medium">{u.fullName}</div>
            <Typography.Text type="secondary" className="text-xs!">
              @{u.username} · {u.email}
            </Typography.Text>
          </div>
        </div>
      ),
    },
    {
      title: 'Vai trò',
      dataIndex: 'role',
      render: (role: UserRoleCode) => (
        <Tag color={roleMeta[role].color}>{roleMeta[role].label}</Tag>
      ),
    },
    {
      title: 'Chi nhánh',
      dataIndex: 'branchName',
      render: (name?: string) => name ?? <Typography.Text type="secondary">Toàn hệ thống</Typography.Text>,
    },
    {
      title: '2FA',
      dataIndex: 'twoFactorEnabled',
      align: 'center',
      render: (enabled: boolean) =>
        enabled ? (
          <Tag color="green" icon={<SafetyOutlined />}>Bật</Tag>
        ) : (
          <Tag>Tắt</Tag>
        ),
    },
    {
      title: 'Login gần nhất',
      dataIndex: 'lastLoginAt',
      render: formatDateTime,
    },
    {
      title: 'Trạng thái',
      dataIndex: 'status',
      render: (s: UserStatus) => {
        const m = statusMeta[s];
        return <Tag color={m.color} icon={m.icon}>{m.label}</Tag>;
      },
    },
    {
      title: 'Hành động',
      key: 'actions',
      render: (_, u) => (
        <Space size="small">
          <Button size="small" icon={<KeyOutlined />}>Đổi MK</Button>
          {u.status === 'LOCKED' ? (
            <Button size="small" type="primary" ghost icon={<UnlockOutlined />}>Mở khóa</Button>
          ) : (
            <Button size="small" danger icon={<LockOutlined />}>Khóa</Button>
          )}
        </Space>
      ),
    },
  ];

  return (
    <PageScaffold
      title="Quản trị người dùng"
      description="Quản lý tài khoản, phân vai trò, 2FA và trạng thái người dùng theo chi nhánh."
      moduleName="user-management"
      extra={<Button type="primary" icon={<PlusOutlined />}>Thêm người dùng</Button>}
    >
      <Row gutter={[16, 16]} className="mb-4">
        <Col xs={12} md={6}><Card><Statistic title="Tổng người dùng" value={stats.total} /></Card></Col>
        <Col xs={12} md={6}><Card><Statistic title="Đang hoạt động" value={stats.active} valueStyle={{ color: '#16a34a' }} /></Card></Col>
        <Col xs={12} md={6}><Card><Statistic title="Đã khóa" value={stats.locked} valueStyle={{ color: '#dc2626' }} /></Card></Col>
        <Col xs={12} md={6}><Card><Statistic title="Bật 2FA" value={stats.twoFa} suffix={`/${stats.total}`} /></Card></Col>
      </Row>

      <Card className="mb-4">
        <Row gutter={12}>
          <Col xs={24} md={10}>
            <Input.Search
              allowClear
              placeholder="Tìm theo username, họ tên, email..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </Col>
          <Col xs={12} md={7}>
            <Select className="w-full" value={roleFilter} onChange={setRoleFilter} options={roleFilterOptions} />
          </Col>
          <Col xs={12} md={7}>
            <Select className="w-full" value={statusFilter} onChange={setStatusFilter} options={statusFilterOptions} />
          </Col>
        </Row>
      </Card>

      <Card>
        <Table<AppUser>
          rowKey="id"
          columns={columns}
          dataSource={filtered}
          pagination={{ pageSize: 10 }}
        />
      </Card>

      <Card title="Hoạt động gần đây" className="mt-4">
        <Table
          rowKey="id"
          size="small"
          pagination={false}
          dataSource={activityLogsMock}
          columns={[
            { title: 'Thời gian', dataIndex: 'at', render: formatDateTime, width: 180 },
            {
              title: 'User',
              dataIndex: 'userId',
              render: (id: string) => {
                const u = usersMock.find((x) => x.id === id);
                return u?.fullName ?? id;
              },
            },
            { title: 'Hành động', dataIndex: 'action', render: (a) => <Tag color="blue">{a}</Tag> },
            { title: 'Đối tượng', dataIndex: 'target' },
            { title: 'IP', dataIndex: 'ip' },
          ]}
        />
      </Card>
    </PageScaffold>
  );
}
