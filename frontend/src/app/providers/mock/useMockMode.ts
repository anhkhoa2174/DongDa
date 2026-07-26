import { useContext } from 'react';
import { MockContext } from './mockContext';

export function useMockMode() {
  const mock = useContext(MockContext);

  if (!mock) {
    throw new Error('useMockMode must be used within MockProvider');
  }

  return mock;
}
