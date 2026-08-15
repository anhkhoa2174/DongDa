export type ShiftStatus = 'OPEN' | 'CLOSED';

export type Shift = {
  id: string;
  code: string;
  branchId: string;
  branchName: string;
  openedBy: string;
  openedAt: string;
  closedBy: string | null;
  closedAt: string | null;
  status: ShiftStatus;
};
