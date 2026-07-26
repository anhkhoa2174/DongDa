import { Typography } from 'antd';

type RateCardProps = {
  label: string;
  value: string;
  change?: string;
  adjustment?: string;
  tone?: 'green' | 'gray';
};

export function RateCard({ label, value, change, adjustment, tone = 'gray' }: RateCardProps) {
  const detail = adjustment ? `Biên độ: ${adjustment}` : change;
  const detailColor = tone === 'green' ? 'text-emerald-600' : 'text-slate-400';

  return (
    <div className="min-h-28 rounded-md border border-slate-200 bg-slate-50 p-3.5">
      <Typography.Text className="text-xs! font-bold! text-slate-500! uppercase">{label}</Typography.Text>
      <strong className="mt-2 block font-mono text-2xl leading-tight text-slate-900">{value}</strong>
      {detail && <span className={`mt-1.5 block text-xs ${detailColor}`}>{detail}</span>}
    </div>
  );
}
