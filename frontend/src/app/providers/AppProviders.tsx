import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { App as AntApp } from 'antd';
import dayjs from 'dayjs';
import 'dayjs/locale/vi';
import { Suspense, type PropsWithChildren, useState } from 'react';
import { AppErrorBoundary } from '../components/AppErrorBoundary';
import { AppLoading } from '../components/AppLoading';
import { AuthProvider } from './auth/AuthProvider';
import { AppConfigProvider } from './config/AppConfigProvider';
import { MockProvider } from './mock/MockProvider';
import { NotificationProvider } from './notifications/NotificationProvider';
import { PermissionProvider } from './permissions/PermissionProvider';
import { ThemeProvider } from './theme/ThemeProvider';

dayjs.locale('vi');

export function AppProviders({ children }: PropsWithChildren) {
  const [queryClient] = useState(
    () =>
      new QueryClient({
        defaultOptions: {
          queries: {
            staleTime: 30_000,
            refetchOnWindowFocus: false,
            retry: 1,
          },
        },
      }),
  );

  return (
    <AppConfigProvider>
      <AppErrorBoundary>
        <QueryClientProvider client={queryClient}>
          <ThemeProvider>
            <AntApp>
              <AuthProvider>
                <PermissionProvider>
                  <NotificationProvider>
                    <MockProvider>
                      <Suspense fallback={<AppLoading />}>{children}</Suspense>
                    </MockProvider>
                  </NotificationProvider>
                </PermissionProvider>
              </AuthProvider>
            </AntApp>
          </ThemeProvider>
        </QueryClientProvider>
      </AppErrorBoundary>
    </AppConfigProvider>
  );
}
