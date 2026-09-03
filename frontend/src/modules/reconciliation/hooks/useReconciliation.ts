import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { reconApi, type RunReconInput } from '../api/reconciliation.api';

const KEY = ['reconciliation'] as const;

export function useReconRuns(branchId?: string, provider?: 'WU' | 'MG') {
  return useQuery({ queryKey: [...KEY, 'runs', branchId ?? 'all', provider ?? 'all'], queryFn: () => reconApi.runs(branchId, provider) });
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

export function useSubmittedBranchRuns(provider: 'WU' | 'MG', branchId?: string, enabled = true) {
  return useQuery({
    queryKey: [...KEY, provider, 'submitted', branchId ?? 'all'],
    queryFn: () => reconApi.submittedBranchRuns(provider, branchId),
    enabled,
  });
}

export function useCreateFinalRun(provider: 'WU' | 'MG') {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (branchRunIds: string[]) => reconApi.createFinalRun(provider, branchRunIds),
    onSuccess: () => qc.invalidateQueries({ queryKey: KEY }),
  });
}

export function useParseJournal() {
  return useMutation({
    mutationFn: ({ provider, file }: { provider: 'WU' | 'MG'; file: File }) =>
      reconApi.parseJournal(provider, file),
  });
}
