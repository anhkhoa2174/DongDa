import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { fundApi } from '../api/fundTransfer.api';

const KEY = ['fund'] as const;

export function useFundTransfers() {
  return useQuery({ queryKey: [...KEY, 'transfers'], queryFn: () => fundApi.transfers() });
}
export function useFundBalances() {
  return useQuery({ queryKey: [...KEY, 'balances'], queryFn: () => fundApi.balances() });
}
export function useBranches() {
  return useQuery({ queryKey: ['branches'], queryFn: () => fundApi.branches() });
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
