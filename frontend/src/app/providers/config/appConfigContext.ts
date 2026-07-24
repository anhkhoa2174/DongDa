import { createContext } from 'react';

export type AppConfig = {
  apiBaseUrl: string;
  appName: string;
  environment: string;
  useMockApi: boolean;
};

export const AppConfigContext = createContext<AppConfig | null>(null);
