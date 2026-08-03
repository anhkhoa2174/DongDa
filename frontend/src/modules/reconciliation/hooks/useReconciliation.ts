import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { reconApi, type JournalRowInput } from '../api/reconciliation.api';

const KEY = ['reconciliation'] as const;

export function useReconRuns() {
  return useQuery({ queryKey: [...KEY, 'runs'], queryFn: () => reconApi.runs() });
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
    mutationFn: (v: { provider: string; rows: JournalRowInput[] }) => reconApi.run(v.provider, v.rows),
    onSuccess: () => qc.invalidateQueries({ queryKey: KEY }),
  });
}
