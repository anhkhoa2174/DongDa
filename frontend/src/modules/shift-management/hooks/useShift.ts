import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { shiftApi, type CountInput } from '../api/shift.api';

export function useBranches() {
  return useQuery({ queryKey: ['branches'], queryFn: () => shiftApi.branches() });
}
export function useCurrentShift(branchId?: string) {
  return useQuery({
    queryKey: ['shift', 'current', branchId],
    queryFn: () => shiftApi.current(branchId!),
    enabled: !!branchId,
  });
}
function useInvalidate() {
  const qc = useQueryClient();
  return () => {
    qc.invalidateQueries({ queryKey: ['shift'] });
    qc.invalidateQueries({ queryKey: ['fund'] });
  };
}
export function useOpenShift() {
  const invalidate = useInvalidate();
  return useMutation({
    mutationFn: (v: { branchId: string; openingCounts: CountInput[] }) => shiftApi.open(v.branchId, v.openingCounts),
    onSuccess: invalidate,
  });
}
export function useCloseShift() {
  const invalidate = useInvalidate();
  return useMutation({
    mutationFn: (v: { shiftId: string; closingCounts: CountInput[] }) => shiftApi.close(v.shiftId, v.closingCounts),
    onSuccess: invalidate,
  });
}
