import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  bankApi, type CreateBankAccountInput, type CreateBankMovementInput, type InternalBankTransferInput,
} from '../api/bank.api';

const KEY = ['bank'] as const;

export function useBanks() {
  return useQuery({ queryKey: [...KEY, 'banks'], queryFn: () => bankApi.banks() });
}
export function useBankAccounts(branchId?: string, enabled = true) {
  return useQuery({ queryKey: [...KEY, 'accounts', branchId ?? 'all'], queryFn: () => bankApi.accounts(branchId), enabled });
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

function useInvalidateBank() {
  const qc = useQueryClient();
  return () => {
    qc.invalidateQueries({ queryKey: KEY });
    qc.invalidateQueries({ queryKey: ['fund'] });
    qc.invalidateQueries({ queryKey: ['notifications'] });
  };
}

export function useCreateBankAccount() {
  const invalidate = useInvalidateBank();
  return useMutation({ mutationFn: (input: CreateBankAccountInput) => bankApi.createAccount(input), onSuccess: invalidate });
}
export function useDeactivateBankAccount() {
  const invalidate = useInvalidateBank();
  return useMutation({ mutationFn: (id: string) => bankApi.deactivateAccount(id), onSuccess: invalidate });
}
export function useCreateBankMovement() {
  const invalidate = useInvalidateBank();
  return useMutation({
    mutationFn: ({ bankAccountId, input }: { bankAccountId: string; input: CreateBankMovementInput }) =>
      bankApi.createMovement(bankAccountId, input),
    onSuccess: invalidate,
  });
}
export function useInternalBankTransfer() {
  const invalidate = useInvalidateBank();
  return useMutation({ mutationFn: (input: InternalBankTransferInput) => bankApi.internalTransfer(input), onSuccess: invalidate });
}
export function useAdvances(params: { bankAccountId?: string; branchId?: string; status?: 'ADVANCE_CK' | 'SETTLED' | 'VOIDED' }, enabled = true) {
  return useQuery({
    queryKey: [...KEY, 'advances', params.bankAccountId ?? 'all', params.branchId ?? 'all', params.status ?? 'all'],
    queryFn: () => bankApi.advances(params),
    enabled,
  });
}
export function useSettleAdvanceCk() {
  const invalidate = useInvalidateBank();
  return useMutation({
    mutationFn: ({ advanceId, source, sourceBankAccountId, note }: { advanceId: string; source: 'BRANCH_CASH' | 'BANK_ACCOUNT'; sourceBankAccountId?: string; note?: string }) =>
      bankApi.settleAdvanceCk(advanceId, { source, sourceBankAccountId, note }),
    onSuccess: invalidate,
  });
}
export function useReceiveMoney() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: bankApi.receive,
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: KEY });
      qc.invalidateQueries({ queryKey: ['debts'] });
      qc.invalidateQueries({ queryKey: ['notifications'] });
    },
  });
}
