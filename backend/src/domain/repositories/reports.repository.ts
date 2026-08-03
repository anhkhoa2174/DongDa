// Repository Interface: Báo cáo (Port) — thống kê giao dịch WU/MG/FX
// Layer: Domain

export interface ProviderStat {
  count: number;
  totalUsd: number;
  totalVnd: number;
  profit: number;
}

export interface FxStat {
  buyCount: number;
  sellCount: number;
  buyVnd: number;
  sellVnd: number;
}

export interface TxStats {
  wu: ProviderStat;
  mg: ProviderStat;
  fx: FxStat;
}

export interface ReportFilter {
  branchId?: string;
}

export interface DashboardOperations {
  businessDate: Date;
  transactionCount: number;
  transactionValueVnd: number;
  sourceCounts: { wu: number; mg: number; fx: number; domestic: number };
  pendingVarianceCount: number;
  majorVarianceCount: number;
  minorVarianceCount: number;
  openBranchCount: number;
  totalBranchCount: number;
  closedBranches: string[];
}

export interface CompanyDashboard {
  businessDate: Date;
  overview: {
    totalCapitalVnd: number;
    cashVnd: number;
    cashUsd: number;
    cashValueVnd: number;
    fundAValueVnd: number;
    bankValueVnd: number;
    debtValueVnd: number;
    changePercent: number | null;
    changeValueVnd: number | null;
    capitalTrend: Array<{ date: string; valueVnd: number }>;
  };
  operations: DashboardOperations;
  revenueTrend: Array<{ date: string; label: string; revenueVnd: number; profitVnd: number }>;
  transactionMix: Array<{ source: 'WU' | 'MG' | 'FX' | 'DOMESTIC'; count: number }>;
  branches: Array<{
    id: string;
    code: string;
    name: string;
    manager: string | null;
    shiftStatus: 'open' | 'closed';
    vndBalance: number;
    usdBalance: number;
    todayTransactions: number;
    revenueToday: number;
    profitToday: number;
    discrepancy: 'matched' | 'warning' | 'danger' | 'none';
    discrepancyValueVnd: number;
    riskLevel: 'normal' | 'watch' | 'risk';
  }>;
  activeRates: Array<{
    id: string;
    rateType: string;
    provider: string | null;
    fromCurrency: string;
    toCurrency: string;
    rate: number;
    effectiveFrom: Date;
    approvedAt: Date | null;
  }>;
  ratesUpdatedAt: Date | null;
}

export interface IReportsRepository {
  txStats(filter?: ReportFilter): Promise<TxStats>;
  dashboardOperations(businessDate: Date): Promise<DashboardOperations>;
  companyDashboard(businessDate: Date): Promise<CompanyDashboard>;
}
