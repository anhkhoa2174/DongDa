import { createContext } from 'react';
import type { Permission } from '@/modules/auth/model/permissions';

export type PermissionContextValue = {
  can: (permission: Permission) => boolean;
};

export const PermissionContext = createContext<PermissionContextValue | null>(null);
