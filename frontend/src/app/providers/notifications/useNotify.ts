import { useContext } from 'react';
import { NotificationContext } from './notificationContext';

export function useNotify() {
  const notify = useContext(NotificationContext);

  if (!notify) {
    throw new Error('useNotify must be used within NotificationProvider');
  }

  return notify;
}
