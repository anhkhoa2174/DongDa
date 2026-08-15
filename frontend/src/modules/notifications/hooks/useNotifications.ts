import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { notificationsApi } from '../api/notifications.api';

const notificationsKey = ['notifications'] as const;

export function useNotifications() {
  return useQuery({
    queryKey: notificationsKey,
    queryFn: notificationsApi.list,
    refetchInterval: 15_000,
    refetchOnWindowFocus: true,
  });
}

export function useUnreadNotificationCount() {
  return useQuery({
    queryKey: [...notificationsKey, 'unread-count'],
    queryFn: notificationsApi.unreadCount,
    refetchInterval: 15_000,
    refetchOnWindowFocus: true,
  });
}

export function useMarkNotificationRead() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: notificationsApi.markRead,
    onSuccess: () => queryClient.invalidateQueries({ queryKey: notificationsKey }),
  });
}

export function useMarkAllNotificationsRead() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: notificationsApi.markAllRead,
    onSuccess: () => queryClient.invalidateQueries({ queryKey: notificationsKey }),
  });
}
