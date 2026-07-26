import type { PropsWithChildren } from 'react';
import { useAppConfig } from '../config/useAppConfig';
import { MockContext } from './mockContext';

export function MockProvider({ children }: PropsWithChildren) {
  const { useMockApi } = useAppConfig();

  return <MockContext.Provider value={{ useMockApi }}>{children}</MockContext.Provider>;
}
