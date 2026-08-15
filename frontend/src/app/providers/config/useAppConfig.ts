import { useContext } from 'react';
import { AppConfigContext } from './appConfigContext';

export function useAppConfig() {
  const config = useContext(AppConfigContext);

  if (!config) {
    throw new Error('useAppConfig must be used within AppConfigProvider');
  }

  return config;
}
