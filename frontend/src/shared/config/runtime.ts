export const runtimeConfig = {
  apiBaseUrl: import.meta.env.VITE_API_BASE_URL ?? '/api/v1',
  appName: import.meta.env.VITE_APP_NAME ?? 'Đống Đa Financial Operations',
  environment: import.meta.env.MODE,
  isDevelopment: import.meta.env.DEV,
  isProduction: import.meta.env.PROD,
  useMockApi: import.meta.env.VITE_USE_MOCK_API === 'true',
  uiTestMode: import.meta.env.VITE_UI_TEST_MODE === 'true',
} as const;

export const isUiTestMode = runtimeConfig.uiTestMode;
