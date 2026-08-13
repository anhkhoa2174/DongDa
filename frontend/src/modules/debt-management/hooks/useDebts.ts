import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { debtApi } from '../api/debt.api';
import type { ListDebtsParams } from '../api/debt.api';

const KEY = ['debts'] as const;

export function useDebts(params?: ListDebtsParams) {
  return useQuery({ queryKey: [...KEY, 'list', params], queryFn: () => debtApi.list(params) });
}

export function useDebtMovements(id: string | null) {
  return useQuery({
    queryKey: [...KEY, 'movements', id],
    queryFn: () => debtApi.movements(id!),
    enabled: !!id,
  });
}

export function useBranches() {
  return useQuery({ queryKey: ['branches'], queryFn: () => debtApi.branches() });
}

function useInvalidate() {
  const qc = useQueryClient();
  return () => qc.invalidateQueries({ queryKey: KEY });
}

export function useSettleUsdCashDebt() {
  const invalidate = useInvalidate();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, ...payload }: { id: string; cashUsdAmount: number; oddUsdAmount: number; description?: string }) =>
      debtApi.settleUsdCash(id, payload),
    onSuccess: () => {
      invalidate();
      queryClient.invalidateQueries({ queryKey: ['fund'] });
      queryClient.invalidateQueries({ queryKey: ['notifications'] });
    },
  });
}

export function useSettleVndCashDebt() {
  const invalidate = useInvalidate();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, ...payload }: { id: string; amount: number; description?: string }) =>
      debtApi.settleVndCash(id, payload),
    onSuccess: () => {
      invalidate();
      queryClient.invalidateQueries({ queryKey: ['fund'] });
      queryClient.invalidateQueries({ queryKey: ['notifications'] });
    },
  });
}

export function useSettleDebtBatch() {
  const invalidate = useInvalidate();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: debtApi.settleBatch,
    onSuccess: () => {
      invalidate();
      queryClient.invalidateQueries({ queryKey: ['fund'] });
      queryClient.invalidateQueries({ queryKey: ['bank'] });
      queryClient.invalidateQueries({ queryKey: ['notifications'] });
    },
  });
}

export function useRecordDebt() {
  const invalidate = useInvalidate();
  return useMutation({
    mutationFn: debtApi.record,
    onSuccess: invalidate,
  });
}
