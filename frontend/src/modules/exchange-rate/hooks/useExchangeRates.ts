import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { exchangeRateApi, type CreateRatePayload } from '../api/exchangeRate.api';

const KEY = ['exchange-rates'] as const;

export function useExchangeRates() {
  return useQuery({ queryKey: [...KEY, 'all'], queryFn: () => exchangeRateApi.list() });
}

export function useActiveRates() {
  return useQuery({ queryKey: [...KEY, 'active'], queryFn: () => exchangeRateApi.active() });
}

function useInvalidate() {
  const qc = useQueryClient();
  return () => qc.invalidateQueries({ queryKey: KEY });
}

export function useCreateRate() {
  const invalidate = useInvalidate();
  return useMutation({
    mutationFn: (payload: CreateRatePayload) => exchangeRateApi.create(payload),
    onSuccess: invalidate,
  });
}

export function useApproveRate() {
  const invalidate = useInvalidate();
  return useMutation({
    mutationFn: (id: string) => exchangeRateApi.approve(id),
    onSuccess: invalidate,
  });
}

export function useRejectRate() {
  const invalidate = useInvalidate();
  return useMutation({
    mutationFn: (id: string) => exchangeRateApi.reject(id),
    onSuccess: invalidate,
  });
}
