import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { fxApi } from '../api/fx.api';

const KEY = ['fx-trading'] as const;

export function useFxTransactions() {
  return useQuery({ queryKey: [...KEY, 'list'], queryFn: () => fxApi.list() });
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
