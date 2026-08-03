import { Button, Card, Space, Tag, Typography } from 'antd';
import type { ReactNode } from 'react';

export type BalanceAction = {
  label: string;
  icon: ReactNode;
  onClick: () => void;
  primary?: boolean;
  disabled?: boolean;
};

export type SubBalance = {
  label: string;
  value: string;
};

type BalanceOverviewCardProps = {
  eyebrow: string;
  amount: string;
  amountSuffix?: string;
  statusTag: {
    label: string;
    color: string;
  };
  caption: string;
  subBalances: SubBalance[];
  sparklineBars: number[];
  actions: BalanceAction[];
  loading?: boolean;
};

export function BalanceOverviewCard({
  eyebrow,
  amount,
  amountSuffix = '₫',
  statusTag,
  caption,
  subBalances,
  sparklineBars,
  actions,
  loading = false,
}: BalanceOverviewCardProps) {
  return (
    <Card loading={loading} className="balance-card" bordered={false}>
      <div className="balance-card__content">
        <div className="balance-card__main">
          <Typography.Text className="balance-card__eyebrow">{eyebrow}</Typography.Text>
          <div className="balance-card__amount">
            {amount}
            <span>{amountSuffix}</span>
          </div>
          <Space size={8} wrap>
            <Tag color={statusTag.color}>{statusTag.label}</Tag>
            <Typography.Text className="balance-card__muted">{caption}</Typography.Text>
          </Space>
        </div>

        <div className="balance-card__sparkline">
          <Typography.Text className="balance-card__eyebrow">Sparkline 7 ngày</Typography.Text>
          <div className="sparkline">
            {sparklineBars.map((height, index) => (
              <span
                key={`${index}-${height}`}
                style={{ height: `${height}%`, opacity: index === sparklineBars.length - 1 ? 1 : 0.62 }}
              />
            ))}
          </div>
        </div>
      </div>

      <div className="sub-balance-grid">
        {subBalances.map((balance) => (
          <div key={balance.label}>
            <Typography.Text>{balance.label}</Typography.Text>
            <strong>{balance.value}</strong>
          </div>
        ))}
      </div>

      <Space className="dashboard-actions" size={8} wrap>
        {actions.map((action) => (
          <Button
            key={action.label}
            type={action.primary ? 'primary' : 'default'}
            ghost={action.primary}
            icon={action.icon}
            onClick={action.onClick}
            disabled={action.disabled}
          >
            {action.label}
          </Button>
        ))}
      </Space>
    </Card>
  );
}
