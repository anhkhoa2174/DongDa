import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { wuApi } from '../api/wu.api';

const KEY = ['wu'] as const;

export function useWuTransactions() {
  return useQuery({ queryKey: [...KEY, 'list'], queryFn: () => wuApi.list() });
}
export function useBranches() {
  return useQuery({ queryKey: ['branches'], queryFn: () => wuApi.branches() });
}
export function useCreateWu() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: wuApi.create,
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: KEY });
      qc.invalidateQueries({ queryKey: ['fund'] });
      qc.invalidateQueries({ queryKey: ['debts'] });
    },
  });
}
