import {
  BellOutlined,
  CheckOutlined,
  DownOutlined,
  LogoutOutlined,
  MenuFoldOutlined,
  MenuUnfoldOutlined,
  SettingOutlined,
  UserOutlined,
} from '@ant-design/icons';
import { Avatar, Badge, Button, Drawer, Dropdown, Layout, List, Menu, Space, Tag, Typography } from 'antd';
import type { MenuProps } from 'antd';
import { useMemo, useState } from 'react';
import { Outlet, useLocation, useNavigate } from 'react-router-dom';
import { navigationItems } from '@/shared/constants/navigation';
import type { AppMenuItem } from '@/shared/types/navigation';
import { useAuthStore } from '@/modules/auth/model/auth.store';
import { notificationsMock, type AppNotification } from '../data/notifications.mock';
import type { AppRole } from '@/modules/auth/model/auth.types';

const { Header, Content, Sider } = Layout;

function findOpenKeys(items: AppMenuItem[], pathname: string): string[] {
  for (const item of items) {
    if (item.children?.some((child) => child.path === pathname)) {
      return [String(item.key)];
    }
  }

  return ['dashboard'];
}

function filterNavigationByRole(items: AppMenuItem[], role: AppRole | undefined): AppMenuItem[] {
  return items
    .filter((item) => !item.allowedRoles || (role && item.allowedRoles.includes(role)))
    .map((item) => ({
      ...item,
      children: item.children?.filter((child) => !child.allowedRoles || (role && child.allowedRoles.includes(role))),
    }))
    .filter((item) => item.path || (item.children?.length ?? 0) > 0);
}

export function AppLayout() {
  const [collapsed, setCollapsed] = useState(false);
  const [isNotificationOpen, setIsNotificationOpen] = useState(false);
  const [readNotificationIds, setReadNotificationIds] = useState<string[]>([]);
  const location = useLocation();
  const navigate = useNavigate();
  const logout = useAuthStore((state) => state.logout);
  const user = useAuthStore((state) => state.user);
  const visibleNavigationItems = useMemo(() => filterNavigationByRole(navigationItems, user?.role), [user?.role]);
  const openKeys = useMemo(() => findOpenKeys(visibleNavigationItems, location.pathname), [location.pathname, visibleNavigationItems]);
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

  const handleUserMenuClick: MenuProps['onClick'] = ({ key }) => {
    if (key === 'logout') {
      logout();
      navigate('/login');
    }
  };

  const openNotification = (notification: AppNotification) => {
    setReadNotificationIds((current) =>
      current.includes(notification.id) ? current : [...current, notification.id],
    );
    setIsNotificationOpen(false);
    navigate(notification.path);
  };

  const unreadNotificationCount = notificationsMock.filter(
    (notification) => !readNotificationIds.includes(notification.id),
  ).length;

  return (
    <Layout className="min-h-screen">
      <Sider
        width={288}
        collapsed={collapsed}
        breakpoint="lg"
        onBreakpoint={setCollapsed}
        className="!sticky !top-0 !h-screen !min-h-screen !self-start !overflow-hidden"
      >
        <div className={`flex h-16 items-center ${collapsed ? 'px-4' : 'px-5'}`}>
          <Typography.Text strong className={collapsed ? '!text-lg !text-white' : '!text-base !text-white'}>
            {collapsed ? 'ĐĐ' : 'Đống Đa Ops'}
          </Typography.Text>
        </div>
        <Menu
          mode="inline"
          theme="dark"
          items={visibleNavigationItems}
          selectedKeys={[location.pathname]}
          defaultOpenKeys={openKeys}
          onClick={({ key }) => navigate(String(key))}
          className="!h-[calc(100vh-4rem)] !overflow-y-auto !border-e-0"
        />
      </Sider>
      <Layout>
        <Header className="flex h-16 items-center justify-between border-b border-slate-200 px-5">
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
                onClick={() => setIsNotificationOpen(true)}
              />
            </Badge>
            <Dropdown
              menu={{ items: userMenuItems, onClick: handleUserMenuClick }}
              placement="bottomRight"
              trigger={['click']}
            >
              <Button className="header-user-trigger" type="text">
                <Avatar size="small" className="!bg-brand-700">
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
        <Content className="p-6 max-sm:p-4">
          <Outlet />
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
            onClick={() => setReadNotificationIds(notificationsMock.map((notification) => notification.id))}
          >
            Đánh dấu đã đọc
          </Button>
        }
      >
        <List
          className="notification-list"
          dataSource={notificationsMock}
          renderItem={(notification) => { 
            const isUnread = !readNotificationIds.includes(notification.id);

            return (
              <List.Item
                className={isUnread ? 'notification-list__item notification-list__item--unread' : 'notification-list__item'}
                onClick={() => openNotification(notification)}
              >
                <List.Item.Meta
                  avatar={
                    <Badge dot={isUnread}>
                      <Avatar icon={notification.icon} />
                    </Badge>
                  }
                  title={
                    <Space size={8} wrap>
                      <Typography.Text strong>{notification.title}</Typography.Text>
                      <Tag color={notification.color}>{notification.tag}</Tag>
                    </Space>
                  }
                  description={
                    <Space direction="vertical" size={6}>
                      <Typography.Text>{notification.description}</Typography.Text>
                      <Typography.Text type="secondary">{notification.meta}</Typography.Text>
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
