import { Card, Col, Row, Typography } from 'antd';
import type { ReactNode } from 'react';

export type KpiTone = 'blue' | 'green' | 'amber' | 'teal';

export type DashboardKpi = {
  label: string;
  value: string;
  detail: string;
  icon: ReactNode;
  tone: KpiTone;
};

type KpiGridProps = {
  items: DashboardKpi[];
  loading?: boolean;
};

const toneClasses: Record<KpiTone, string> = {
  blue: 'text-blue-600',
  green: 'text-emerald-600',
  amber: 'text-amber-600',
  teal: 'text-brand-700',
};

export function KpiGrid({ items, loading = false }: KpiGridProps) {
  return (
    <Row gutter={[16, 16]}>
      {items.map((kpi) => (
        <Col xs={24} sm={12} xl={6} key={kpi.label}>
          <Card loading={loading} className="h-full [&_.ant-card-body]:p-4">
            <div className="mb-2 flex items-center justify-between gap-3">
              <Typography.Text className="text-xs! font-bold! text-slate-500! uppercase">{kpi.label}</Typography.Text>
              <span className={`text-lg ${toneClasses[kpi.tone]}`}>{kpi.icon}</span>
            </div>
            <div className={`font-mono text-2xl leading-tight font-extrabold ${toneClasses[kpi.tone]}`}>{kpi.value}</div>
            <Typography.Text className={`mt-1! block! text-xs! ${toneClasses[kpi.tone]}`}>
              {kpi.detail}
            </Typography.Text>
          </Card>
        </Col>
      ))}
    </Row>
  );
}
