import { createContext } from 'react';

export type MockContextValue = {
  useMockApi: boolean;
};

export const MockContext = createContext<MockContextValue | null>(null);
