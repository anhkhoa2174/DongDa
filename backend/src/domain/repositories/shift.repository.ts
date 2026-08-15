// Repository Interface: Ca làm việc (Port)
// Layer: Domain

import type { Shift, CashCount, CountInput } from '../entities/shift.entity';

export interface OpenShiftInput {
  branchId: string;
  openedByUserId: string;
  openingCounts: CountInput[];
  note?: string;
}

export interface CloseShiftInput {
  shiftId: string;
  branchId?: string;
  closedByUserId: string;
  closingCounts: CountInput[];
  note?: string;
}

export interface ShiftWithCount {
  shift: Shift;
  cashCount?: CashCount;
}

export interface IShiftRepository {
  findCurrent(branchId: string): Promise<Shift | null>;
  openShift(input: OpenShiftInput): Promise<ShiftWithCount>;
  closeShift(input: CloseShiftInput): Promise<ShiftWithCount>;
  getCashCount(shiftId: string): Promise<CashCount[]>;
}
