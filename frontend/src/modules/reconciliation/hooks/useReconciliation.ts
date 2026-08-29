import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { reconApi, type RunReconInput, type JournalRowInput } from '../api/reconciliation.api';

const KEY = ['reconciliation'] as const;

export function useReconRuns(branchId?: string) {
  return useQuery({ queryKey: [...KEY, 'runs', branchId ?? 'all'], queryFn: () => reconApi.runs(branchId) });
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

export function usePendingJournals(branchId?: string) {
  return useQuery({ queryKey: [...KEY, 'pending', branchId ?? 'all'], queryFn: () => reconApi.pendingJournals(branchId) });
}
export function usePendingJournalDetail(id: string | null) {
  return useQuery({ queryKey: [...KEY, 'pending-detail', id], queryFn: () => reconApi.pendingJournal(id!), enabled: !!id });
}
export function useSubmitPendingJournal() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: { provider: 'WU' | 'MG'; businessDate: string; branchId?: string; rows: JournalRowInput[] }) =>
      reconApi.submitPendingJournal(input),
    onSuccess: () => { qc.invalidateQueries({ queryKey: KEY }); qc.invalidateQueries({ queryKey: ['notifications'] }); },
  });
}
export function useRejectPendingJournal() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, reason }: { id: string; reason?: string }) => reconApi.rejectPendingJournal(id, reason),
    onSuccess: () => qc.invalidateQueries({ queryKey: KEY }),
  });
}
export function useParseJournal() {
  return useMutation({
    mutationFn: ({ provider, file }: { provider: 'WU' | 'MG'; file: File }) =>
      reconApi.parseJournal(provider, file),
  });
}
