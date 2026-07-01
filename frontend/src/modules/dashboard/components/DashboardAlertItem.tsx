import { Button, Typography } from 'antd';
import type { ReactNode } from 'react';
import { useNavigate } from 'react-router-dom';

export type DashboardAlertItemProps = {
  tone: 'red' | 'amber' | 'blue';
  icon: ReactNode;
  title: string;
  description: string;
  action: string;
  path: string;
};

const toneClasses = {
  red: 'border-red-600 bg-red-50 text-red-800',
  amber: 'border-amber-600 bg-amber-50 text-amber-800',
  blue: 'border-blue-600 bg-blue-50 text-blue-700',
};

export function DashboardAlertItem({
  tone,
  icon,
  title,
  description,
  action,
  path,
}: DashboardAlertItemProps) {
  const navigate = useNavigate();

  return (
    <div className={`flex gap-2.5 rounded-md border-l-4 p-3 ${toneClasses[tone]}`}>
      <span className="mt-0.5 shrink-0 text-base">{icon}</span>
      <div>
        <Typography.Text strong>{title}</Typography.Text>
        <p className="mt-0.5 mb-0 text-xs">{description}</p>
        <Button className="h-auto! px-0! pt-1!" type="link" size="small" onClick={() => navigate(path)}>
          {action}
        </Button>
      </div>
    </div>
  );

}
