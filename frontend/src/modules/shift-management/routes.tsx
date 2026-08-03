import { ShiftManagementPage } from './pages/ShiftManagementPage';
import { ShiftWorkspacePage } from './pages/ShiftWorkspacePage';

export const shiftManagementRoutes = [
  { path: 'shift-management/open-shift', element: <ShiftManagementPage /> },
  { path: 'shift-management/active-shift', element: <ShiftWorkspacePage /> },
];
