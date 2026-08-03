import { useQuery } from '@tanstack/react-query';
import { centralFundApi } from '../api/centralFund.api';

export function useCentralFundSummary() {
  return useQuery({
    queryKey: ['fund', 'central-summary'],
    queryFn: centralFundApi.getSummary,
    refetchInterval: 15_000,
  });
}
