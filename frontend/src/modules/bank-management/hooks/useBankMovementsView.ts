// Map /bank/movements + /bank/accounts → shape mock (giữ UI trang cũ) — data THẬT
import { useBankAccountsView } from './useBankAccountsView';
import { useBankMovements } from './useBank';
import type { BankAccount, BankBalanceMovement } from '../model/bank.types';
import { formatDateTime } from '@/shared/utils/formatters';

export function useBankMovementsView(accountKey?: string): {
  account?: BankAccount;
  movements: BankBalanceMovement[];
} {
  const { data: accounts } = useBankAccountsView();
  const { data: raw = [] } = useBankMovements(accountKey);
  const account = accounts.find((a) => a.key === accountKey);
  const movements: BankBalanceMovement[] = raw.map((m) => ({
    key: m.id,
    accountKey: m.bankAccountId,
    occurredAt: formatDateTime(m.businessDate),
    type: (m.movementType as BankBalanceMovement['type']) ?? 'DEPOSIT',
    description: m.description ?? '',
    counterparty: '',
    amount: m.amount,
    balanceBefore: m.balanceBefore,
    balanceAfter: m.balanceAfter,
    referenceCode: m.bankReference ?? '',
    createdBy: '',
  }));
  return { account, movements };
}
