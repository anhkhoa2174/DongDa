import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { branchMonitoringApi, type MonitoringPeriod } from '../api/branchMonitoring.api';

const KEY = ['branch-monitoring'] as const;

export function useMonitoringBranches() {
  return useQuery({ queryKey: [...KEY, 'branches'], queryFn: branchMonitoringApi.listBranches });
}

export function useCreateBranch() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: branchMonitoringApi.createBranch,
    onSuccess: async () => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: KEY }),
        queryClient.invalidateQueries({ queryKey: ['branches'] }),
      ]);
    },
  });
}

export function useBranchFunds(branchId?: string) {
  return useQuery({
    queryKey: [...KEY, 'funds', branchId],
    queryFn: () => branchMonitoringApi.getFunds(branchId!),
    enabled: Boolean(branchId),
  });
}

export function useBranchActivity(branchId: string | undefined, period: MonitoringPeriod, date: string) {
  return useQuery({
    queryKey: [...KEY, 'activity', branchId, period, date],
    queryFn: () => branchMonitoringApi.getActivity(branchId!, period, date),
    enabled: Boolean(branchId),
  });
}
