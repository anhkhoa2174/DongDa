import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  exchangeRateApi,
  type CreateRatePayload,
  type ExchangeRateHistoryParams,
  type ListRatesParams,
} from '../api/exchangeRate.api';

const KEY = ['exchange-rates'] as const;

export function useExchangeRates(params?: ListRatesParams) {
  return useQuery({
    queryKey: [...KEY, 'list', params],
    queryFn: () => exchangeRateApi.list(params),
  });
}

export function useActiveRates() {
  return useQuery({ queryKey: [...KEY, 'active'], queryFn: () => exchangeRateApi.active() });
}

export function useExchangeRateHistory(params: ExchangeRateHistoryParams) {
  return useQuery({
    queryKey: [...KEY, 'history', params],
    queryFn: () => exchangeRateApi.history(params),
  });
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

export function useParseRateImage() {
  return useMutation({ mutationFn: (file: File) => exchangeRateApi.parseImage(file) });
}

export function useCreateRateBatch() {
  const invalidate = useInvalidate();
  return useMutation({
    mutationFn: (rates: CreateRatePayload[]) => exchangeRateApi.createBatch(rates),
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
