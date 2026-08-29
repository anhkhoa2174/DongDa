import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { fundApi } from '../api/fundTransfer.api';

const KEY = ['fund'] as const;

export function useFundTransfers() {
  return useQuery({ queryKey: [...KEY, 'transfers'], queryFn: () => fundApi.transfers() });
}
export function useFundBalances(branchId?: string) {
  return useQuery({
    queryKey: [...KEY, 'balances', branchId],
    queryFn: () => fundApi.balances(branchId),
    enabled: Boolean(branchId),
  });
}

function useInvalidate() {
  const qc = useQueryClient();
  return () => qc.invalidateQueries({ queryKey: KEY });
}

export function useCreateTransfer() {
  const invalidate = useInvalidate();
  return useMutation({ mutationFn: fundApi.create, onSuccess: invalidate });
}
export function useConfirmTransfer() {
  const invalidate = useInvalidate();
  return useMutation({ mutationFn: (id: string) => fundApi.confirm(id), onSuccess: invalidate });
}
export function useRejectTransfer() {
  const invalidate = useInvalidate();
  return useMutation({ mutationFn: (id: string) => fundApi.reject(id), onSuccess: invalidate });
}
export function useCancelTransfer() {
  const invalidate = useInvalidate();
  return useMutation({ mutationFn: (id: string) => fundApi.cancel(id), onSuccess: invalidate });
}
