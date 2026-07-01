import type { ReactNode } from 'react';
import type { AppRole } from '@/modules/auth/model/auth.types';

export type AppMenuItem = {
  key: string;
  label: ReactNode;
  icon?: ReactNode;
  path?: string;
  children?: AppMenuItem[];
  allowedRoles?: AppRole[];
};
