import { httpClient } from '@/shared/api/httpClient';

export interface ProviderStat {
  count: number;
  totalUsd: number;
  totalVnd: number;
  transactionValueVnd: number;
  debtGeneratedUsd: number;
  debtGeneratedVnd: number;
}
export interface SummaryDto {
  transactions: {
    wu: ProviderStat;
    mg: ProviderStat;
    fx: { buyCount: number; sellCount: number; buyVnd: number; sellVnd: number };
  };
  cash: { vnd: number; usd: number };
  fundA: { currency: string; balance: number }[];
  bank: {
    accounts: { bankCode: string; currency: string; balance: number }[];
    totalVnd: number; totalUsd: number;
  };
  debt: {
    items: { provider: string; currency: string; outstanding: number; status: string }[];
    wuOutstandingUsd: number; mgOutstandingUsd: number;
  };
  alerts: { type: string; level: string; message: string }[];
}

export interface DashboardOperationsDto {
  businessDate: string;
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

export interface CompanyDashboardDto {
  businessDate: string;
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
  operations: DashboardOperationsDto;
  transactionValueTrend: Array<{ date: string; label: string; valueVnd: number }>;
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
    transactionValueTodayVnd: number;
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
    buyRate: number | null;
    sellRate: number | null;
    margin: number;
    effectiveFrom: string;
    approvedAt: string | null;
  }>;
  ratesUpdatedAt: string | null;
}

export interface ReportPreviewDto {
  reportType: string;
  format: string;
  generatedAt: string;
  title: string;
  sheets: { name: string; aoa: (string | number)[][] }[];
}

export const summaryApi = {
  get: () => httpClient.get<SummaryDto>('/reports/summary').then((r) => r.data),
  generate: async (input: {
    reportType: string; format: 'PREVIEW' | 'EXCEL' | 'PDF'; branchId?: string; dateFrom?: string; dateTo?: string;
    columns?: string[]; // cashbook: cột hiển thị
    currencyCode?: 'USD' | 'VND'; // wu_usd / mg_usd: loại quỹ
  }) => {
    if (input.format === 'EXCEL') {
      // Nhận file nhị phân và tải về.
      const response = await httpClient.post('/reports/generate', input, { responseType: 'blob' });
      const disposition = String(response.headers['content-disposition'] ?? '');
      const match = /filename="?([^"]+)"?/.exec(disposition);
      const fileName = match?.[1] ?? `bao-cao-${input.reportType}.xlsx`;
      const url = URL.createObjectURL(response.data as Blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = fileName;
      document.body.appendChild(link);
      link.click();
      link.remove();
      URL.revokeObjectURL(url);
      return { downloaded: true, fileName };
    }
    const response = await httpClient.post<ReportPreviewDto>('/reports/generate', input);
    return response.data;
  },
  dashboardOperations: (date: string) =>
    httpClient.get<DashboardOperationsDto>('/reports/dashboard-operations', { params: { date } })
      .then((response) => response.data),
  companyDashboard: (date: string) =>
    httpClient.get<CompanyDashboardDto>('/reports/company-dashboard', { params: { date } })
      .then((response) => response.data),
};
