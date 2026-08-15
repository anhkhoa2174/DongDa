import { Card, Typography } from 'antd';
import type { ReactNode } from 'react';

export type OperationalOverviewMetric = {
  label: string;
  value: string;
  note?: string;
  icon?: ReactNode;
};

type OperationalOverviewCardProps = {
  eyebrow: string;
  title: ReactNode;
  icon: ReactNode;
  meta?: ReactNode;
  aside?: ReactNode;
  metrics: OperationalOverviewMetric[];
  iconTone?: 'brand' | 'success';
  loading?: boolean;
  className?: string;
};

export function OperationalOverviewCard({
  eyebrow,
  title,
  icon,
  meta,
  aside,
  metrics,
  iconTone = 'brand',
  loading = false,
  className = '',
}: OperationalOverviewCardProps) {
  return (
    <Card
      loading={loading}
      bordered={false}
      className={`operational-overview ${className}`.trim()}
      classNames={{ body: 'p-0!' }}
    >
      <div className="operational-overview__header">
        <div className="operational-overview__identity">
          <span className={`operational-overview__icon is-${iconTone}`}>{icon}</span>
          <div className="min-w-0">
            <Typography.Text className="operational-overview__eyebrow">{eyebrow}</Typography.Text>
            <Typography.Title level={2} className="operational-overview__title">{title}</Typography.Title>
            {meta && <div className="operational-overview__meta">{meta}</div>}
          </div>
        </div>
        {aside && <div className="operational-overview__aside">{aside}</div>}
      </div>

      <div className={`operational-overview__metrics operational-overview__metrics--${metrics.length}`}>
        {metrics.map((metric) => (
          <div className="operational-overview__metric" key={metric.label}>
            {metric.icon && <span className="operational-overview__metric-icon">{metric.icon}</span>}
            <div className="min-w-0">
              <Typography.Text>{metric.label}</Typography.Text>
              <strong>{metric.value}</strong>
              {metric.note && <span>{metric.note}</span>}
            </div>
          </div>
        ))}
      </div>
    </Card>
  );
}
