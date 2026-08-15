import type { RouteObject } from 'react-router-dom';
import { auditLogRoutes } from '@/modules/audit-log/routes';
import { bankManagementRoutes } from '@/modules/bank-management/routes';
import { branchManagementRoutes } from '@/modules/branch-management/routes';
import { cashCountRoutes } from '@/modules/cash-count/routes';
import { dashboardRoutes } from '@/modules/dashboard/routes';
import { debtManagementRoutes } from '@/modules/debt-management/routes';
import { domesticTransferRoutes } from '@/modules/domestic-transfer/routes';
import { exchangeRateRoutes } from '@/modules/exchange-rate/routes';
import { foreignExchangeRoutes } from '@/modules/foreign-exchange/routes';
import { fundManagementRoutes } from '@/modules/fund-management/routes';
import { fundTransferRoutes } from '@/modules/fund-transfer/routes';
import { moneyGramRoutes } from '@/modules/moneygram/routes';
import { reconciliationRoutes } from '@/modules/reconciliation/routes';
import { reportsRoutes } from '@/modules/reports/routes';
import { shiftManagementRoutes } from '@/modules/shift-management/routes';
import { transactionRoutes } from '@/modules/transactions/routes';
import { userManagementRoutes } from '@/modules/user-management/routes';
import { westernUnionRoutes } from '@/modules/western-union/routes';

export const moduleRoutes: RouteObject[] = [
  ...dashboardRoutes,
  ...shiftManagementRoutes,
  ...transactionRoutes,
  ...branchManagementRoutes,
  ...westernUnionRoutes,
  ...moneyGramRoutes,
  ...foreignExchangeRoutes,
  ...domesticTransferRoutes,
  ...fundManagementRoutes,
  ...cashCountRoutes,
  ...fundTransferRoutes,
  ...exchangeRateRoutes,
  ...debtManagementRoutes,
  ...bankManagementRoutes,
  ...reconciliationRoutes,
  ...reportsRoutes,
  ...auditLogRoutes,
  ...userManagementRoutes,
];
