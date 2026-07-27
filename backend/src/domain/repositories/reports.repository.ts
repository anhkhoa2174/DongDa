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

export interface IReportsRepository {
  txStats(): Promise<TxStats>;
}
