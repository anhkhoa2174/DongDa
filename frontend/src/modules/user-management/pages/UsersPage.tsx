import {
  BankOutlined,
  CheckCircleOutlined,
  LockOutlined,
  PlusOutlined,
  TeamOutlined,
  UnlockOutlined,
  UserOutlined,
} from '@ant-design/icons';
import {
  App,
  Button,
  Card,
  Col,
  Form,
  Input,
  Modal,
  Popconfirm,
  Row,
  Select,
  Space,
  Statistic,
  Table,
  Tag,
  Typography,
} from 'antd';
import type { ColumnsType } from 'antd/es/table';
import axios from 'axios';
import { useMemo, useState } from 'react';
import { PageScaffold } from '@/shared/components/PageScaffold';
import { formatDateTime } from '@/shared/utils/formatters';
import type {
  CreateUserPayload,
  CreatableUserRole,
  UserDto,
  UserRoleCode,
} from '../api/userManagement.api';
import {
  useCreateManagedUser,
  useManagedBranches,
  useManagedUsers,
  useSetManagedUserActive,
} from '../hooks/useUserManagement';

const roleMeta: Record<UserRoleCode, { label: string; color: string }> = {
  ADMIN: { label: 'Giám đốc', color: 'gold' },
  MANAGER: { label: 'KTTH', color: 'blue' },
  STAFF: { label: 'Nhân viên', color: 'default' },
  AUDITOR: { label: 'Kiểm toán', color: 'purple' },
};

const roleFilterOptions = [
  { value: 'ALL', label: 'Tất cả vai trò' },
  ...Object.entries(roleMeta).map(([value, meta]) => ({ value, label: meta.label })),
];

function getErrorMessage(error: unknown) {
  if (axios.isAxiosError(error)) {
    const message = error.response?.data?.message;
    return Array.isArray(message) ? message.join(', ') : message || 'Không thể hoàn tất thao tác';
  }
  return 'Không thể hoàn tất thao tác';
}

export function UsersPage() {
  const { message } = App.useApp();
  const [accountForm] = Form.useForm<CreateUserPayload>();
  const [accountModalOpen, setAccountModalOpen] = useState(false);
  const [search, setSearch] = useState('');
  const [roleFilter, setRoleFilter] = useState('ALL');
  const [statusFilter, setStatusFilter] = useState('ALL');
  const { data: users = [], isLoading: usersLoading } = useManagedUsers();
  const { data: branches = [] } = useManagedBranches();
  const createUser = useCreateManagedUser();
  const setUserActive = useSetManagedUserActive();
  const selectedRole = Form.useWatch('role', accountForm);

  const headOffice = branches.find((branch) => branch.type === 'HEAD_OFFICE');
  const operatingBranches = branches.filter((branch) => branch.type === 'BRANCH');
  const branchMap = useMemo(
    () => new Map(branches.map((branch) => [branch.id, branch])),
    [branches],
  );
  const filteredUsers = useMemo(() => {
    const keyword = search.trim().toLowerCase();
    return users.filter((user) => {
      const matchesSearch = !keyword || [user.username, user.fullName, user.email]
        .some((value) => value.toLowerCase().includes(keyword));
      const matchesRole = roleFilter === 'ALL' || user.role === roleFilter;
      const matchesStatus = statusFilter === 'ALL'
        || (statusFilter === 'ACTIVE' ? user.isActive : !user.isActive);
      return matchesSearch && matchesRole && matchesStatus;
    });
  }, [roleFilter, search, statusFilter, users]);
  const stats = useMemo(() => ({
    total: users.length,
    active: users.filter((user) => user.isActive).length,
    managers: users.filter((user) => user.role === 'MANAGER').length,
    staff: users.filter((user) => user.role === 'STAFF').length,
  }), [users]);

  const openAccountModal = () => {
    accountForm.resetFields();
    accountForm.setFieldsValue({ role: 'STAFF' });
    setAccountModalOpen(true);
  };

  const submitAccount = async () => {
    try {
      const values = await accountForm.validateFields();
      const branchId = values.role === 'MANAGER' ? headOffice?.id : values.branchId;
      if (!branchId) {
        message.error(values.role === 'MANAGER' ? 'Chưa cấu hình Hội sở' : 'Vui lòng chọn chi nhánh');
        return;
      }
      await createUser.mutateAsync({ ...values, branchId });
      message.success('Đã tạo tài khoản');
      setAccountModalOpen(false);
      accountForm.resetFields();
    } catch (error) {
      if (!('errorFields' in (error as object))) message.error(getErrorMessage(error));
    }
  };

  const toggleUser = async (user: UserDto) => {
    try {
      await setUserActive.mutateAsync({ id: user.id, isActive: !user.isActive });
      message.success(user.isActive ? 'Đã vô hiệu hóa tài khoản' : 'Đã kích hoạt tài khoản');
    } catch (error) {
      message.error(getErrorMessage(error));
    }
  };

  const userColumns: ColumnsType<UserDto> = [
    {
      title: 'Người dùng',
      key: 'user',
      render: (_, user) => (
        <Space size={12}>
          <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-amber-50 text-amber-700">
            <UserOutlined />
          </div>
          <div>
            <Typography.Text strong>{user.fullName}</Typography.Text>
            <br />
            <Typography.Text type="secondary" className="text-xs!">
              @{user.username} · {user.email}
            </Typography.Text>
          </div>
        </Space>
      ),
    },
    {
      title: 'Vai trò',
      dataIndex: 'role',
      width: 130,
      render: (role: UserRoleCode) => <Tag color={roleMeta[role].color}>{roleMeta[role].label}</Tag>,
    },
    {
      title: 'Đơn vị làm việc',
      dataIndex: 'branchId',
      render: (branchId?: string) => {
        const branch = branchId ? branchMap.get(branchId) : undefined;
        return branch ? `${branch.code} · ${branch.name}` : 'Toàn hệ thống';
      },
    },
    {
      title: 'Ngày tạo',
      dataIndex: 'createdAt',
      width: 170,
      render: formatDateTime,
    },
    {
      title: 'Trạng thái',
      dataIndex: 'isActive',
      width: 130,
      render: (isActive: boolean) => isActive
        ? <Tag color="green" icon={<CheckCircleOutlined />}>Hoạt động</Tag>
        : <Tag icon={<LockOutlined />}>Vô hiệu</Tag>,
    },
    {
      title: 'Thao tác',
      key: 'actions',
      width: 145,
      render: (_, user) => user.role === 'ADMIN' ? (
        <Typography.Text type="secondary">Được bảo vệ</Typography.Text>
      ) : (
        <Popconfirm
          title={user.isActive ? 'Vô hiệu hóa tài khoản?' : 'Kích hoạt lại tài khoản?'}
          description={user.isActive ? 'Người dùng sẽ không thể đăng nhập.' : undefined}
          okText="Xác nhận"
          cancelText="Hủy"
          onConfirm={() => toggleUser(user)}
        >
          <Button
            size="small"
            danger={user.isActive}
            icon={user.isActive ? <LockOutlined /> : <UnlockOutlined />}
            loading={setUserActive.isPending && setUserActive.variables?.id === user.id}
          >
            {user.isActive ? 'Vô hiệu' : 'Kích hoạt'}
          </Button>
        </Popconfirm>
      ),
    },
  ];

  return (
    <PageScaffold
      title="Quản trị người dùng"
      description="Quản lý tài khoản KTTH và nhân viên trong toàn hệ thống."
      moduleName="user-management"
      extra={<Button type="primary" icon={<PlusOutlined />} onClick={openAccountModal}>Tạo tài khoản</Button>}
    >
      <Row gutter={[16, 16]} className="mb-4">
        <Col xs={12} lg={6}><Card><Statistic title="Tổng tài khoản" value={stats.total} prefix={<TeamOutlined />} /></Card></Col>
        <Col xs={12} lg={6}><Card><Statistic title="Đang hoạt động" value={stats.active} valueStyle={{ color: '#15803d' }} /></Card></Col>
        <Col xs={12} lg={6}><Card><Statistic title="KTTH" value={stats.managers} prefix={<BankOutlined />} /></Card></Col>
        <Col xs={12} lg={6}><Card><Statistic title="Nhân viên" value={stats.staff} prefix={<UserOutlined />} /></Card></Col>
      </Row>

      <Card className="mb-4">
        <Row gutter={[12, 12]}>
          <Col xs={24} md={10}>
            <Input.Search
              allowClear
              placeholder="Tìm tên đăng nhập, họ tên hoặc email"
              value={search}
              onChange={(event) => setSearch(event.target.value)}
            />
          </Col>
          <Col xs={12} md={7}>
            <Select className="w-full" value={roleFilter} onChange={setRoleFilter} options={roleFilterOptions} />
          </Col>
          <Col xs={12} md={7}>
            <Select
              className="w-full"
              value={statusFilter}
              onChange={setStatusFilter}
              options={[
                { value: 'ALL', label: 'Tất cả trạng thái' },
                { value: 'ACTIVE', label: 'Hoạt động' },
                { value: 'INACTIVE', label: 'Vô hiệu' },
              ]}
            />
          </Col>
        </Row>
      </Card>

      <Card title="Tài khoản hệ thống">
        <Table<UserDto>
          rowKey="id"
          columns={userColumns}
          dataSource={filteredUsers}
          loading={usersLoading}
          scroll={{ x: 980 }}
          pagination={{ pageSize: 10, showSizeChanger: false }}
        />
      </Card>

      <Modal
        title="Tạo tài khoản"
        open={accountModalOpen}
        okText="Tạo tài khoản"
        cancelText="Hủy"
        confirmLoading={createUser.isPending}
        onOk={submitAccount}
        onCancel={() => setAccountModalOpen(false)}
        destroyOnClose
      >
        <Form form={accountForm} layout="vertical" preserve={false} className="pt-3">
          <Form.Item name="role" label="Loại tài khoản" rules={[{ required: true }]}>
            <Select<CreatableUserRole>
              options={[
                { value: 'MANAGER', label: 'KTTH' },
                { value: 'STAFF', label: 'Nhân viên chi nhánh' },
              ]}
            />
          </Form.Item>
          <Form.Item name="fullName" label="Họ và tên" rules={[{ required: true, message: 'Vui lòng nhập họ và tên' }, { max: 100 }]}>
            <Input autoComplete="name" />
          </Form.Item>
          <Row gutter={12}>
            <Col xs={24} md={12}>
              <Form.Item
                name="username"
                label="Tên đăng nhập"
                rules={[
                  { required: true, message: 'Vui lòng nhập tên đăng nhập' },
                  { pattern: /^[a-zA-Z0-9_]+$/, message: 'Chỉ dùng chữ, số và dấu gạch dưới' },
                ]}
              >
                <Input autoComplete="off" />
              </Form.Item>
            </Col>
            <Col xs={24} md={12}>
              <Form.Item name="email" label="Email" rules={[{ required: true }, { type: 'email', message: 'Email không hợp lệ' }]}>
                <Input autoComplete="email" />
              </Form.Item>
            </Col>
          </Row>
          <Form.Item
            name="password"
            label="Mật khẩu ban đầu"
            extra="Tối thiểu 8 ký tự, có chữ hoa, chữ thường và số."
            rules={[
              { required: true, message: 'Vui lòng nhập mật khẩu' },
              { min: 8, message: 'Mật khẩu phải có ít nhất 8 ký tự' },
              { pattern: /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)/, message: 'Mật khẩu phải có chữ hoa, chữ thường và số' },
            ]}
          >
            <Input.Password autoComplete="new-password" />
          </Form.Item>
          {selectedRole === 'MANAGER' ? (
            <Form.Item label="Đơn vị làm việc">
              <Input value={headOffice ? `${headOffice.code} · ${headOffice.name}` : 'Chưa cấu hình Hội sở'} disabled />
            </Form.Item>
          ) : (
            <Form.Item name="branchId" label="Chi nhánh làm việc" rules={[{ required: true, message: 'Vui lòng chọn chi nhánh' }]}>
              <Select
                showSearch
                optionFilterProp="label"
                placeholder="Chọn chi nhánh"
                options={operatingBranches.map((branch) => ({
                  value: branch.id,
                  label: `${branch.code} · ${branch.name}`,
                }))}
              />
            </Form.Item>
          )}
        </Form>
      </Modal>

    </PageScaffold>
  );
}
