import {
  DollarOutlined,
  SafetyCertificateOutlined,
} from '@ant-design/icons';
import type { ReactNode } from 'react';

export type AppNotification = {
  id: string;
  title: string;
  description: string;
  meta: string;
  tag: string;
  color: string;
  icon: ReactNode;
  path: string;
};

export const notificationsMock: AppNotification[] = [
  {
    id: 'rate-approval',
    title: 'Tỷ giá mới chờ duyệt',
    description: 'KTTH vừa gửi bảng gồm Paid Bán, Paid Mua, Giá Bán và Giá Mua.',
    meta: '23:48 · Hôm nay',
    tag: 'Tỷ giá',
    color: 'blue',
    icon: <DollarOutlined />,
    path: '/exchange-rate',
  },
  {
    id: 'reconciliation',
    title: 'Cảnh báo đối chiếu cuối ca',
    description: 'Chi nhánh An Đông đang thiếu 180.000 VND so với sổ cuối ca.',
    meta: '22:55 · Hôm nay',
    tag: 'Sai lệch',
    color: 'red',
    icon: <SafetyCertificateOutlined />,
    path: '/shift-management/active-shift',
  },
];
