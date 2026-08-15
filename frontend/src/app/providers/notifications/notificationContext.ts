import { createContext } from 'react';

export type NotificationPayload = string;

export type NotificationContextValue = {
  success: (content: NotificationPayload) => void;
  error: (content: NotificationPayload) => void;
  warning: (content: NotificationPayload) => void;
  info: (content: NotificationPayload) => void;
  push: (content: NotificationPayload) => void;
};

export const NotificationContext = createContext<NotificationContextValue | null>(null);
