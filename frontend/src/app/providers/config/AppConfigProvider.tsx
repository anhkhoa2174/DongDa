import type { PropsWithChildren } from 'react';
import { runtimeConfig } from '@/shared/config/runtime';
import { AppConfigContext, type AppConfig } from './appConfigContext';

const appConfig: AppConfig = {
  apiBaseUrl: runtimeConfig.apiBaseUrl,
  appName: runtimeConfig.appName,
  environment: runtimeConfig.environment,
  useMockApi: runtimeConfig.useMockApi,
};

export function AppConfigProvider({ children }: PropsWithChildren) {
  return <AppConfigContext.Provider value={appConfig}>{children}</AppConfigContext.Provider>;
}
