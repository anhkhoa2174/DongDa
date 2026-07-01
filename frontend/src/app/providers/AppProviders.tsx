import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { App as AntApp, ConfigProvider, theme } from 'antd';
import viVN from 'antd/locale/vi_VN';
import dayjs from 'dayjs';
import 'dayjs/locale/vi';
import { type PropsWithChildren, useState } from 'react';

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
    <QueryClientProvider client={queryClient}>
      <ConfigProvider
        locale={viVN}
        theme={{
          algorithm: theme.defaultAlgorithm,
          token: {
            colorPrimary: '#0f766e',
            colorInfo: '#2563eb',
            borderRadius: 6,
            fontFamily:
              'Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
          },
          components: {
            Layout: {
              bodyBg: '#f5f7fb',
              headerBg: '#ffffff',
              siderBg: '#111827',
            },
            Menu: {
              darkItemBg: '#111827',
              darkSubMenuItemBg: '#0f172a',
              darkItemSelectedBg: '#0f766e',
            },
          },
        }}
      >
        <AntApp>{children}</AntApp>
      </ConfigProvider>
    </QueryClientProvider>
  );
}
