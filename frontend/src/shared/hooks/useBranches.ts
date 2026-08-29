import { useQuery } from '@tanstack/react-query';
import { branchesApi } from '../api/branches.api';

export const branchesQueryKey = ['branches'] as const;

export function useBranches() {
  return useQuery({ queryKey: branchesQueryKey, queryFn: branchesApi.list });
}
