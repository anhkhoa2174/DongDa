import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { bankApi } from '../api/bank.api';

const KEY = ['bank'] as const;

export function useBankAccounts(enabled = true) {
  return useQuery({ queryKey: [...KEY, 'accounts'], queryFn: () => bankApi.accounts(), enabled });
}
export function useBankMovements(bankAccountId?: string) {
  return useQuery({
    queryKey: [...KEY, 'movements', bankAccountId ?? 'all'],
    queryFn: () => bankApi.movements(bankAccountId),
  });
}
export function useDebtsForSettle() {
  return useQuery({ queryKey: ['debts', 'list'], queryFn: () => bankApi.debts() });
}
export function useReceiveMoney() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: bankApi.receive,
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: KEY });
      qc.invalidateQueries({ queryKey: ['debts'] });
    },
  });
}
