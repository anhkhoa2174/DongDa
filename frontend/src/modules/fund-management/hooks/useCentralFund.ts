import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { centralFundApi } from '../api/centralFund.api';

export function useCentralFundSummary(enabled = true) {
  return useQuery({
    queryKey: ['fund', 'central-summary'],
    queryFn: centralFundApi.getSummary,
    refetchInterval: 15_000,
    enabled,
  });
}

export function useCreateBranchFundMovement() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: centralFundApi.createBranchMovement,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['fund'] });
      queryClient.invalidateQueries({ queryKey: ['bank'] });
    },
  });
}

export function useCreateCentralFundMovement() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: centralFundApi.createMovement,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['fund'] });
      queryClient.invalidateQueries({ queryKey: ['bank'] });
    },
  });
}
