import { httpClient } from '@/shared/api/httpClient';

export interface CashCountLineDto {
  currencyCode: string;
  systemAmount: number;
  actualAmount: number;
  variance: number;
  denominations?: DenominationCountDto[];
}
export interface DenominationCountDto { denomination: number; quantity: number; amount: number; }
export interface CashCountDto {
  id: string;
  shiftId: string;
  countedAt: string;
  lines: CashCountLineDto[];
}
export interface ShiftDto {
  id: string;
  branchId: string;
  shiftCode: string;
  status: string;
  openedAt: string;
  closedAt?: string | null;
}
export interface CurrentShiftDto {
  shift: ShiftDto | null;
  cashCounts: CashCountDto[];
}
export interface CountInput {
  currency: string;
  actualAmount: number;
  denominations?: Array<{ denomination: number; quantity: number }>;
}
export const shiftApi = {
  current: (branchId: string) =>
    httpClient.get<CurrentShiftDto>('/shifts/current', { params: { branchId } }).then((r) => r.data),
  open: (branchId: string, openingCounts: CountInput[]) =>
    httpClient.post('/shifts/open', { branchId, openingCounts }).then((r) => r.data),
  close: (shiftId: string, closingCounts: CountInput[], branchId?: string, note?: string) =>
    httpClient.post(`/shifts/${shiftId}/close`, { branchId, closingCounts, note }).then((r) => r.data),
};
