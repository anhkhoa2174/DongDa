// Báo cáo tổng hợp — nối API thật (/reports/summary)
import { Card, Col, Row, Statistic, Table, Tag } from 'antd';
import type { ColumnsType } from 'antd/es/table';
import { PageScaffold } from '@/shared/components/PageScaffold';
import { formatNumber } from '@/shared/utils/formatters';
import { useSummary } from '../hooks/useSummary';
import type { ProviderStat, SummaryDto } from '../api/summary.api';

const vnd = (n: number) => formatNumber(n, 2);
type ProviderRow = ProviderStat & { key: string; name: string };
type DebtRow = SummaryDto['debt']['items'][number];

export function ReportsLivePage() {
  const { data, isLoading } = useSummary();
  const t = data?.transactions;

  const provRows: ProviderRow[] = [
    { key: 'WU', name: 'Western Union', ...(t?.wu ?? { count: 0, totalUsd: 0, totalVnd: 0, transactionValueVnd: 0, debtGeneratedUsd: 0, debtGeneratedVnd: 0 }) },
    { key: 'MG', name: 'MoneyGram', ...(t?.mg ?? { count: 0, totalUsd: 0, totalVnd: 0, transactionValueVnd: 0, debtGeneratedUsd: 0, debtGeneratedVnd: 0 }) },
  ];
  const provCols: ColumnsType<ProviderRow> = [
    { title: 'Dịch vụ', dataIndex: 'name' },
    { title: 'Số GD', dataIndex: 'count', align: 'right' },
    { title: 'Giá trị giao dịch', dataIndex: 'transactionValueVnd', align: 'right', render: (v) => `${vnd(v)} VND` },
    {
      title: 'Công nợ phát sinh',
      align: 'right',
      render: (_, row) => (
        <div>
          {row.debtGeneratedUsd > 0 && <div>{vnd(row.debtGeneratedUsd)} USD</div>}
          {row.debtGeneratedVnd > 0 && <div>{vnd(row.debtGeneratedVnd)} VND</div>}
          {!row.debtGeneratedUsd && !row.debtGeneratedVnd && 'Không phát sinh'}
        </div>
      ),
    },
  ];

  const debtCols: ColumnsType<DebtRow> = [
    { title: 'Đối tác', dataIndex: 'provider', render: (v) => <Tag>{v}</Tag> },
    { title: 'Loại tiền', dataIndex: 'currency' },
    { title: 'Còn nợ', dataIndex: 'outstanding', align: 'right', render: vnd },
    { title: 'Trạng thái', dataIndex: 'status', render: (v) => <Tag color={v === 'SETTLED' ? 'green' : v === 'PARTIALLY_SETTLED' ? 'blue' : 'gold'}>{v}</Tag> },
  ];

  return (
    <PageScaffold
      title="Báo cáo tổng hợp"
      description="Tổng hợp WU/MG, ngoại tệ, quỹ, ngân hàng, công nợ từ dữ liệu thực tế."
      moduleName="reports"
    >
      <Row gutter={[16, 16]}>
        <Col xs={12} lg={6}><Card loading={isLoading}><Statistic title="Quỹ VND" value={data?.cash.vnd ?? 0} formatter={(v) => vnd(Number(v))} /></Card></Col>
        <Col xs={12} lg={6}><Card loading={isLoading}><Statistic title="Quỹ USD" value={data?.cash.usd ?? 0} formatter={(v) => vnd(Number(v))} suffix="$" /></Card></Col>
        <Col xs={12} lg={6}><Card loading={isLoading}><Statistic title="Ngân hàng USD" value={data?.bank.totalUsd ?? 0} formatter={(v) => vnd(Number(v))} suffix="$" /></Card></Col>
        <Col xs={12} lg={6}><Card loading={isLoading}><Statistic title="FX mua/bán" value={`${t?.fx.buyCount ?? 0}/${t?.fx.sellCount ?? 0}`} /></Card></Col>
      </Row>

      <Card title="Báo cáo WU / MoneyGram" size="small" className="mt-4">
        <Table rowKey="key" size="small" pagination={false} loading={isLoading} columns={provCols} dataSource={provRows} />
      </Card>

      <Row gutter={16} className="mt-4">
        <Col xs={24} lg={12}>
          <Card title="Công nợ" size="small">
            <Table rowKey={(r) => r.provider + r.currency} size="small" pagination={false}
              columns={debtCols} dataSource={data?.debt.items ?? []} />
          </Card>
        </Col>
        <Col xs={24} lg={12}>
          <Card title="Số dư ngân hàng" size="small">
            <Table rowKey={(r) => r.bankCode + r.currency} size="small" pagination={false}
              columns={[
                { title: 'Ngân hàng', dataIndex: 'bankCode', render: (v) => <Tag color="blue">{v}</Tag> },
                { title: 'Loại tiền', dataIndex: 'currency' },
                { title: 'Số dư', dataIndex: 'balance', align: 'right', render: vnd },
              ]}
              dataSource={data?.bank.accounts ?? []} />
          </Card>
        </Col>
      </Row>
    </PageScaffold>
  );
}
