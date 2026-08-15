import { App as AntApp } from 'antd';
import { useMemo, type PropsWithChildren } from 'react';
import { NotificationContext, type NotificationContextValue } from './notificationContext';

export function NotificationProvider({ children }: PropsWithChildren) {
  const { message, notification } = AntApp.useApp();
  const value = useMemo<NotificationContextValue>(
    () => ({
      success: (content) => void message.success(content),
      error: (content) => void message.error(content),
      warning: (content) => void message.warning(content),
      info: (content) => void message.info(content),
      push: (content) => notification.info({ message: 'Thông báo', description: content }),
    }),
    [message, notification],
  );

  return <NotificationContext.Provider value={value}>{children}</NotificationContext.Provider>;
}
