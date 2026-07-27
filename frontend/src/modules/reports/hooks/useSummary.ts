import { useQuery } from '@tanstack/react-query';
import { summaryApi } from '../api/summary.api';

export function useSummary() {
  return useQuery({ queryKey: ['reports', 'summary'], queryFn: () => summaryApi.get(), refetchInterval: 15_000 });
}
