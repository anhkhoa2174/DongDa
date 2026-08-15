import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { mgApi } from '../api/mg.api';

const KEY = ['mg'] as const;

export function useMgTransactions(branchId?: string) {
  return useQuery({ queryKey: [...KEY, 'list', branchId], queryFn: () => mgApi.list(branchId) });
}
export function useBranches() {
  return useQuery({ queryKey: ['branches'], queryFn: () => mgApi.branches() });
}
export function useCreateMg() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: mgApi.create,
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: KEY });
      qc.invalidateQueries({ queryKey: ['fund'] });
      qc.invalidateQueries({ queryKey: ['debts'] });
    },
  });
}
