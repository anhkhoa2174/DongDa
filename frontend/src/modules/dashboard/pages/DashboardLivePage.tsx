// Dashboard điều hành — nối API thật (/reports/summary, near real-time)
import { Alert, Card, Col, Row, Statistic, Table, Tag, Typography } from 'antd';
import { BankOutlined, DollarOutlined, RiseOutlined, WarningOutlined } from '@ant-design/icons';
import { PageScaffold } from '@/shared/components/PageScaffold';
import { useSummary } from '@/modules/reports/hooks/useSummary';

const vnd = (n: number) => n.toLocaleString('vi-VN');

export function DashboardLivePage() {
  const { data, isLoading } = useSummary();

  const t = data?.transactions;
  const totalProfit = (t?.wu.profit ?? 0) + (t?.mg.profit ?? 0);

  return (
    <PageScaffold
      title="Dashboard điều hành"
      description="Số liệu gần thời gian thực từ toàn bộ nghiệp vụ (tự làm mới mỗi 15s)."
      moduleName="dashboard"
    >
      {/* KPI hàng 1 */}
      <Row gutter={[16, 16]}>
        <Col xs={12} lg={6}>
          <Card loading={isLoading}><Statistic title="Quỹ tiền mặt VND" value={data?.cash.vnd ?? 0} formatter={(v) => vnd(Number(v))} prefix={<DollarOutlined />} /></Card>
        </Col>
        <Col xs={12} lg={6}>
          <Card loading={isLoading}><Statistic title="Quỹ tiền mặt USD" value={data?.cash.usd ?? 0} formatter={(v) => vnd(Number(v))} suffix="$" /></Card>
        </Col>
        <Col xs={12} lg={6}>
          <Card loading={isLoading}><Statistic title="Số dư ngân hàng USD" value={data?.bank.totalUsd ?? 0} formatter={(v) => vnd(Number(v))} prefix={<BankOutlined />} suffix="$" /></Card>
        </Col>
        <Col xs={12} lg={6}>
          <Card loading={isLoading}><Statistic title="Lợi nhuận WU+MG" value={totalProfit} formatter={(v) => vnd(Number(v))} prefix={<RiseOutlined />} valueStyle={{ color: '#3f8600' }} suffix="đ" /></Card>
        </Col>
      </Row>

      {/* WU / MG / Công nợ */}
      <Row gutter={[16, 16]} className="mt-4">
        <Col xs={24} lg={8}>
          <Card title="Western Union" size="small" loading={isLoading}>
            <Statistic title="Giao dịch" value={t?.wu.count ?? 0} />
            <Statistic title="Tổng USD" value={t?.wu.totalUsd ?? 0} formatter={(v) => vnd(Number(v))} suffix="$" />
            <Statistic title="Công nợ USD" value={data?.debt.wuOutstandingUsd ?? 0} valueStyle={{ color: '#cf1322' }} suffix="$" />
          </Card>
        </Col>
        <Col xs={24} lg={8}>
          <Card title="MoneyGram" size="small" loading={isLoading}>
            <Statistic title="Giao dịch" value={t?.mg.count ?? 0} />
            <Statistic title="Tổng USD" value={t?.mg.totalUsd ?? 0} formatter={(v) => vnd(Number(v))} suffix="$" />
            <Statistic title="Công nợ USD" value={data?.debt.mgOutstandingUsd ?? 0} valueStyle={{ color: '#cf1322' }} suffix="$" />
          </Card>
        </Col>
        <Col xs={24} lg={8}>
          <Card title="Ngoại tệ (Quỹ A)" size="small" loading={isLoading}>
            <Statistic title="GD mua / bán" value={`${t?.fx.buyCount ?? 0} / ${t?.fx.sellCount ?? 0}`} />
            <Table size="small" rowKey="currency" pagination={false}
              dataSource={data?.fundA ?? []}
              columns={[
                { title: 'Loại', dataIndex: 'currency' },
                { title: 'Tồn', dataIndex: 'balance', align: 'right', render: vnd },
              ]} />
          </Card>
        </Col>
      </Row>

      {/* Cảnh báo */}
      <Card title={<span><WarningOutlined /> Cảnh báo ({data?.alerts.length ?? 0})</span>} size="small" className="mt-4">
        {(data?.alerts ?? []).length === 0
          ? <Typography.Text type="secondary">Không có cảnh báo.</Typography.Text>
          : (data?.alerts ?? []).map((a, i) => (
            <Alert key={i} type={a.level === 'error' ? 'error' : 'warning'} showIcon className="mb-2"
              message={<span><Tag>{a.type}</Tag>{a.message}</span>} />
          ))}
      </Card>
    </PageScaffold>
  );
}
