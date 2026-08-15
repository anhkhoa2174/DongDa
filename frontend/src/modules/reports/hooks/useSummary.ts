import { useQuery } from '@tanstack/react-query';
import { summaryApi } from '../api/summary.api';

export function useSummary() {
  return useQuery({ queryKey: ['reports', 'summary'], queryFn: () => summaryApi.get(), refetchInterval: 15_000 });
}

export function useDashboardOperations(date: string) {
  return useQuery({
    queryKey: ['reports', 'dashboard-operations', date],
    queryFn: () => summaryApi.dashboardOperations(date),
    refetchInterval: 15_000,
  });
}

export function useCompanyDashboard(date: string) {
  return useQuery({
    queryKey: ['reports', 'company-dashboard', date],
    queryFn: () => summaryApi.companyDashboard(date),
    refetchInterval: 15_000,
  });
}
