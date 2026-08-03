import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { fxApi } from '../api/fx.api';

const KEY = ['fx-trading'] as const;

export function useFxTransactions(branchId?: string) {
  return useQuery({ queryKey: [...KEY, 'list', branchId], queryFn: () => fxApi.list(branchId) });
}
export function useFxStock() {
  return useQuery({ queryKey: [...KEY, 'stock'], queryFn: () => fxApi.stock() });
}
export function useBranches() {
  return useQuery({ queryKey: ['branches'], queryFn: () => fxApi.branches() });
}
export function useCreateFx() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: fxApi.create,
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: KEY });
      qc.invalidateQueries({ queryKey: ['fund'] });
    },
  });
}
