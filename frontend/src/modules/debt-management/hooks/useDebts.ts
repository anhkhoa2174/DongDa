import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { debtApi } from '../api/debt.api';

const KEY = ['debts'] as const;

export function useDebts() {
  return useQuery({ queryKey: [...KEY, 'list'], queryFn: () => debtApi.list() });
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

export function useSettleDebt() {
  const invalidate = useInvalidate();
  return useMutation({
    mutationFn: (v: { id: string; amount: number; description?: string }) =>
      debtApi.settle(v.id, v.amount, v.description),
    onSuccess: invalidate,
  });
}

export function useRecordDebt() {
  const invalidate = useInvalidate();
  return useMutation({
    mutationFn: debtApi.record,
    onSuccess: invalidate,
  });
}
