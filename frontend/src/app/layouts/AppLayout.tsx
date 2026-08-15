import {
  BellOutlined,
  BankOutlined,
  CheckOutlined,
  DownOutlined,
  LogoutOutlined,
  MenuFoldOutlined,
  MenuUnfoldOutlined,
  MoneyCollectOutlined,
  SettingOutlined,
  FileTextOutlined,
  FileDoneOutlined,
  SafetyCertificateOutlined,
  SwapOutlined,
  UserOutlined,
  WarningOutlined,
} from '@ant-design/icons';
import { Avatar, Badge, Button, Drawer, Dropdown, Layout, List, Menu, Space, Tag, Typography } from 'antd';
import type { MenuProps } from 'antd';
import { useMemo, useState } from 'react';
import { Outlet, useLocation, useNavigate } from 'react-router-dom';
import { navigationItems } from '@/shared/constants/navigation';
import type { AppMenuItem } from '@/shared/types/navigation';
import { logoutWithApi } from '@/modules/auth/api/auth.api';
import { useAuthStore } from '@/modules/auth/model/auth.store';
import type { AppNotification, NotificationCategory } from '@/modules/notifications/api/notifications.api';
import {
  useMarkAllNotificationsRead,
  useMarkNotificationRead,
  useNotifications,
  useUnreadNotificationCount,
} from '@/modules/notifications/hooks/useNotifications';
import { formatDateTime } from '@/shared/utils/formatters';
import type { AppRole } from '@/modules/auth/model/auth.types';
import { hasBackendPermission, hasPermission } from '@/modules/auth/model/permissions';

const { Header, Content, Sider } = Layout;

function findOpenKeys(items: AppMenuItem[], pathname: string): string[] {
  for (const item of items) {
    if (item.children?.some((child) => child.path === pathname)) {
      return [String(item.key)];
    }
  }

  return ['dashboard'];
}

function canAccessMenuItem(
  item: AppMenuItem,
  role: AppRole | undefined,
  permissions: string[] | undefined,
) {
  const matchesRole = !item.allowedRoles || (role && item.allowedRoles.includes(role));
  const matchesPermission = item.requiredPermission
    ? permissions?.length
      ? hasBackendPermission(permissions, item.requiredPermission)
      : hasPermission(role, item.requiredPermission)
    : true;

  return Boolean(matchesRole && matchesPermission);
}

function filterNavigationByRole(
  items: AppMenuItem[],
  role: AppRole | undefined,
  permissions: string[] | undefined,
): AppMenuItem[] {
  return items
    .filter((item) => canAccessMenuItem(item, role, permissions))
    .map((item) => ({
      ...item,
      children: item.children?.filter((child) => canAccessMenuItem(child, role, permissions)),
    }))
    .filter((item) => item.path || (item.children?.length ?? 0) > 0);
}

export function AppLayout() {
  const [collapsed, setCollapsed] = useState(false);
  const [isNotificationOpen, setIsNotificationOpen] = useState(false);
  const location = useLocation();
  const navigate = useNavigate();
  const logout = useAuthStore((state) => state.logout);
  const user = useAuthStore((state) => state.user);
  const notificationsQuery = useNotifications();
  const unreadCountQuery = useUnreadNotificationCount();
  const markRead = useMarkNotificationRead();
  const markAllRead = useMarkAllNotificationsRead();
  const notifications = notificationsQuery.data ?? [];
  const visibleNavigationItems = useMemo(
    () => filterNavigationByRole(navigationItems, user?.role, user?.permissions),
    [user?.permissions, user?.role],
  );
  const openKeys = useMemo(() => findOpenKeys(visibleNavigationItems, location.pathname), [location.pathname, visibleNavigationItems]);
  const selectedNavigationKey = useMemo(() => {
    const isTransactionWorkspace = [
      '/western-union/',
      '/moneygram/',
      '/foreign-exchange/',
      '/domestic-transfer/',
    ].some((prefix) => location.pathname.startsWith(prefix));

    if (isTransactionWorkspace) return '/transactions';

    const isFundWorkspace = [
      '/cash-count/',
      '/fund-transfer',
      '/fund-management/branch-funds',
    ].some((prefix) => location.pathname.startsWith(prefix));
    if (isFundWorkspace) {
      return user?.role === 'branch'
        ? '/fund-management/branch-funds'
        : '/fund-management/central-fund';
    }

    if (location.pathname.startsWith('/exchange-rate')) return '/exchange-rate';
    if (location.pathname.startsWith('/debt-management')) return '/debt-management';

    return location.pathname;
  }, [location.pathname, user?.role]);
  const roleLabel = {
    director: 'Giám đốc',
    accountant: 'Kế toán tổng hợp',
    branch: 'Chi nhánh',
    auditor: 'Kiểm toán viên',
  }[user?.role ?? 'director'];

  const userMenuItems: MenuProps['items'] = [
    {
      key: 'identity',
      disabled: true,
      label: (
        <div className="user-menu-identity">
          <Typography.Text strong>{user?.name ?? 'Admin'}</Typography.Text>
          <Typography.Text type="secondary">{roleLabel}</Typography.Text>
        </div>
      ),
    },
    { type: 'divider' },
    { key: 'profile', icon: <UserOutlined />, label: 'Hồ sơ cá nhân' },
    { key: 'settings', icon: <SettingOutlined />, label: 'Cài đặt tài khoản' },
    { type: 'divider' },
    { key: 'logout', icon: <LogoutOutlined />, label: 'Đăng xuất', danger: true },
  ];

  const handleUserMenuClick: MenuProps['onClick'] = async ({ key }) => {
    if (key === 'profile') {
      navigate('/profile');
      return;
    }

    if (key === 'settings') {
      navigate('/profile#security');
      return;
    }

    if (key === 'logout') {
      try {
        await logoutWithApi();
      } catch {
        // Client-side logout still clears local session when the token is expired.
      }

      logout();
      navigate('/login');
    }
  };

  const openNotification = (notification: AppNotification) => {
    if (notification.status === 'UNREAD') markRead.mutate(notification.id);
    setIsNotificationOpen(false);
    navigate(notification.path);
  };

  const unreadNotificationCount = unreadCountQuery.data
    ?? notifications.filter((notification) => notification.status === 'UNREAD').length;

  return (
    <Layout className="app-shell min-h-screen">
      <Sider
        width={288}
        collapsed={collapsed}
        breakpoint="lg"
        onBreakpoint={setCollapsed}
        className="app-sider !sticky !top-0 !h-screen !min-h-screen !self-start !overflow-hidden"
      >
        <div className={`flex h-16 items-center ${collapsed ? 'px-4' : 'px-5'}`}>
          {collapsed ? (
            <div className="flex size-10 items-center justify-center rounded-lg bg-white p-1 shadow-sm">
              <img src="/navigation-logo.png" alt="Đống Đa Ops" className="max-h-full max-w-full object-contain" />
            </div>
          ) : (
            <div className="flex min-w-0 items-center gap-3">
              <div className="flex size-11 shrink-0 items-center justify-center rounded-lg bg-white p-1 shadow-sm">
                <img src="/navigation-logo.png" alt="Đống Đa Ops" className="max-h-full max-w-full object-contain" />
              </div>
              <div className="min-w-0">
                <div className="truncate text-xl font-extrabold text-brand-700">Đống Đa</div>
              </div>
            </div>
          )}
        </div>
        <Menu
          mode="inline"
          theme="dark"
          items={visibleNavigationItems}
          selectedKeys={[selectedNavigationKey]}
          defaultOpenKeys={openKeys}
          onClick={({ key }) => navigate(String(key))}
          className="!h-[calc(100vh-4rem)] !overflow-y-auto !border-e-0"
        />
      </Sider>
      <Layout>
        <Header className="app-header flex h-16 items-center justify-between border-b border-slate-200 bg-white/95! px-5">
          <Button
            aria-label={collapsed ? 'Mở menu' : 'Thu gọn menu'}
            icon={collapsed ? <MenuUnfoldOutlined /> : <MenuFoldOutlined />}
            onClick={() => setCollapsed((value) => !value)}
          />
          <Space size={12}>
            <Badge count={unreadNotificationCount} size="small">
              <Button
                aria-label="Thông báo"
                icon={<BellOutlined />}
                onClick={() => {
                  setIsNotificationOpen(true);
                  void notificationsQuery.refetch();
                  void unreadCountQuery.refetch();
                }}
              />
            </Badge>
            <Dropdown
              menu={{ items: userMenuItems, onClick: handleUserMenuClick }}
              placement="bottomRight"
              trigger={['click']}
            >
              <Button className="header-user-trigger" type="text">
                <Avatar size="small" className="!bg-brand-700 !text-black">
                  {user?.name.charAt(0) ?? 'A'}
                </Avatar>
                <span className="header-user-copy">
                  <Typography.Text>{user?.name ?? 'Admin'}</Typography.Text>
                  <Typography.Text type="secondary">{roleLabel}</Typography.Text>
                </span>
                <DownOutlined />
              </Button>
            </Dropdown>
          </Space>
        </Header>
        <Content className="app-content p-6 max-sm:p-4">
          <div className="mx-auto w-full max-w-[1560px]">
            <Outlet />
          </div>
        </Content>
      </Layout>
      <Drawer
        title={
          <Space>
            <span>Thông báo</span>
            <Tag>{unreadNotificationCount} chưa đọc</Tag>
          </Space>
        }
        placement="right"
        width={440}
        open={isNotificationOpen}
        onClose={() => setIsNotificationOpen(false)}
        extra={
          <Button
            type="text"
            icon={<CheckOutlined />}
            disabled={unreadNotificationCount === 0}
            loading={markAllRead.isPending}
            onClick={() => markAllRead.mutate()}
          >
            Đánh dấu đã đọc
          </Button>
        }
      >
        <List
          className="notification-list"
          loading={notificationsQuery.isLoading}
          locale={{ emptyText: 'Chưa có thông báo' }}
          dataSource={notifications}
          renderItem={(notification) => { 
            const isUnread = notification.status === 'UNREAD';
            const presentation = notificationPresentation(notification.category);

            return (
              <List.Item
                className={isUnread ? 'notification-list__item notification-list__item--unread' : 'notification-list__item'}
                onClick={() => openNotification(notification)}
              >
                <List.Item.Meta
                  avatar={
                    <Badge dot={isUnread}>
                      <Avatar icon={presentation.icon} />
                    </Badge>
                  }
                  title={
                    <Space size={8} wrap>
                      <Typography.Text strong>{notification.title}</Typography.Text>
                      <Tag color={presentation.color}>{presentation.label}</Tag>
                    </Space>
                  }
                  description={
                    <Space direction="vertical" size={6}>
                      <Typography.Text>{notification.body}</Typography.Text>
                      <Typography.Text type="secondary">{formatDateTime(notification.createdAt)}</Typography.Text>
                      <Button type="link" size="small">
                        Mở chi tiết
                      </Button>
                    </Space>
                  }
                />
              </List.Item>
            );
          }}
        />
      </Drawer>
    </Layout>
  );
}

function notificationPresentation(category: NotificationCategory) {
  const presentations = {
    ACCOUNT: { label: 'Tài khoản', color: 'gold', icon: <UserOutlined /> },
    REPORT: { label: 'Báo cáo', color: 'blue', icon: <FileTextOutlined /> },
    FUND_TRANSFER: { label: 'Tiếp quỹ', color: 'cyan', icon: <SwapOutlined /> },
    FUND_MOVEMENT: { label: 'Thu / chi', color: 'green', icon: <BankOutlined /> },
    SHIFT: { label: 'Sai lệch', color: 'red', icon: <SafetyCertificateOutlined /> },
    DEBT: { label: 'Công nợ', color: 'gold', icon: <MoneyCollectOutlined /> },
    RECONCILIATION: { label: 'Đối chiếu', color: 'red', icon: <WarningOutlined /> },
    TRANSACTION: { label: 'Giao dịch', color: 'gold', icon: <FileDoneOutlined /> },
    SYSTEM: { label: 'Hệ thống', color: 'default', icon: <BellOutlined /> },
  } as const;
  return presentations[category] ?? presentations.SYSTEM;
}
