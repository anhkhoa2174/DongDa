import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { reconApi, type RunReconInput } from '../api/reconciliation.api';

const KEY = ['reconciliation'] as const;

export function useReconRuns() {
  return useQuery({ queryKey: [...KEY, 'runs'], queryFn: () => reconApi.runs() });
}
export function useFundReconciliation(branchId?: string) {
  return useQuery({
    queryKey: [...KEY, 'fund', branchId ?? 'all'],
    queryFn: () => reconApi.fundReconciliation(branchId),
  });
}
export function useReconItems(runId: string | null) {
  return useQuery({
    queryKey: [...KEY, 'items', runId],
    queryFn: () => reconApi.items(runId!),
    enabled: !!runId,
  });
}
export function useRunReconciliation() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: RunReconInput) => reconApi.run(input),
    onSuccess: () => qc.invalidateQueries({ queryKey: KEY }),
  });
}

export function useParseJournal() {
  return useMutation({
    mutationFn: ({ provider, file }: { provider: 'WU' | 'MG'; file: File }) =>
      reconApi.parseJournal(provider, file),
  });
}
