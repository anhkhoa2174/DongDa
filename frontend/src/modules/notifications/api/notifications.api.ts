import { httpClient } from '@/shared/api/httpClient';

export type NotificationStatus = 'UNREAD' | 'READ';
export type NotificationCategory =
  | 'ACCOUNT'
  | 'REPORT'
  | 'FUND_TRANSFER'
  | 'FUND_MOVEMENT'
  | 'SHIFT'
  | 'DEBT'
  | 'RECONCILIATION'
  | 'TRANSACTION'
  | 'SYSTEM';

export interface AppNotification {
  id: string;
  title: string;
  body: string | null;
  status: NotificationStatus;
  sourceType: string;
  sourceId: string | null;
  category: NotificationCategory;
  path: string;
  createdAt: string;
}

export const notificationsApi = {
  list: () => httpClient.get<AppNotification[]>('/notifications').then((response) => response.data),
  unreadCount: () => httpClient.get<{ count: number }>('/notifications/unread-count').then((response) => response.data.count),
  markRead: (id: string) => httpClient.patch(`/notifications/${id}/read`).then((response) => response.data),
  markAllRead: () => httpClient.patch('/notifications/read-all').then((response) => response.data),
};
