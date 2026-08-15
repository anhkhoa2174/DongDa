// Map API /bank/accounts to the richer view model used by the account cards.
// Field backend chưa có (pending/today/reconciliation...) tạm để mặc định.
import { useBankAccounts } from './useBank';
import type { BankAccount } from '../model/bank.types';

export function useBankAccountsView(): { data: BankAccount[]; isLoading: boolean } {
  const { data = [], isLoading } = useBankAccounts();
  const mapped: BankAccount[] = data.map((a) => ({
    key: a.id,
    bankCode: a.bankCode as BankAccount['bankCode'],
    bankName: a.bankName,
    accountName: a.accountName,
    accountNumber: a.accountNo,
    currency: a.currencyCode as BankAccount['currency'],
    balance: a.currentBalance,
    availableBalance: a.currentBalance,
    pendingIn: 0,
    pendingOut: 0,
    todayIn: 0,
    todayOut: 0,
    transactionCountToday: 0,
    reconciliationStatus: 'MATCHED',
    status: 'ACTIVE',
    lastReconciledAt: '—',
    ownerScope: 'Quỹ Chung',
    purpose: '',
    linkedModules: [],
  }));
  return { data: mapped, isLoading };
}
