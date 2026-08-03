import { create } from 'zustand';
import { isUiTestMode } from '@/shared/config/runtime';
import { demoOpenShiftMock } from '../data/shift.mock';
import type { Shift } from './shift.types';

export type { Shift, ShiftStatus } from './shift.types';

type ShiftState = {
  currentShift: Shift | null;
  openShift: (input: Pick<Shift, 'branchId' | 'branchName' | 'openedBy'>) => void;
  closeShift: (closedBy: string) => void;
  clearShift: () => void;
};

export const useShiftStore = create<ShiftState>((set) => ({
  currentShift: isUiTestMode ? demoOpenShiftMock : null,
  openShift: ({ branchId, branchName, openedBy }) => {
    const openedAt = new Date().toISOString();
    set({
      currentShift: {
        id: `shift-${branchId}-${Date.now()}`,
        code: `${branchId.toUpperCase()}-${new Date().toISOString().slice(0, 10).replace(/-/g, '')}-01`,
        branchId,
        branchName,
        openedBy,
        openedAt,
        closedBy: null,
        closedAt: null,
        status: 'OPEN',
      },
    });
  },
  closeShift: (closedBy) =>
    set((state) => ({
      currentShift: state.currentShift
        ? {
            ...state.currentShift,
            status: 'CLOSED',
            closedBy,
            closedAt: new Date().toISOString(),
          }
        : null,
    })),
  clearShift: () => set({ currentShift: null }),
}));
