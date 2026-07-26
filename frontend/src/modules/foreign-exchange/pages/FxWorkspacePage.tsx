// Flow FX — Mua/Bán ngoại tệ (nối API thật)
import { App, Button, Card, Col, Form, Input, InputNumber, Row, Segmented, Select, Table, Tag, Typography } from 'antd';
import type { ColumnsType } from 'antd/es/table';
import { SwapOutlined } from '@ant-design/icons';
import { PageScaffold } from '@/shared/components/PageScaffold';
import { useBranches, useCreateFx, useFxStock, useFxTransactions } from '../hooks/useFx';
import type { FxStockDto, FxTransactionDto } from '../api/fx.api';

const CURRENCIES = ['USD', 'EUR', 'JPY', 'GBP', 'AUD', 'SGD', 'CNY', 'KRW', 'THB', 'HKD'];
const money = (n: number) => n.toLocaleString('vi-VN');
const fmt = (v: any) => `${v}`.replace(/\B(?=(\d{3})+(?!\d))/g, ',');

export function FxWorkspacePage() {
  const { message } = App.useApp();
  const { data: txns = [], isLoading } = useFxTransactions();
  const { data: stock = [] } = useFxStock();
  const { data: branches = [] } = useBranches();
  const create = useCreateFx();
  const [form] = Form.useForm();

  const amount = Form.useWatch('fxAmount', form) ?? 0;
  const rate = Form.useWatch('rate', form) ?? 0;
  const side = Form.useWatch('side', form) ?? 'buy';

  const onCreate = async (v: any) => {
    try {
      await create.mutateAsync({
        branchId: v.branchId, isBuy: v.side === 'buy', fxCurrency: v.fxCurrency,
        fxAmount: v.fxAmount, rate: v.rate, customerName: v.customerName,
      });
      message.success(v.side === 'buy' ? 'Đã mua ngoại tệ — tồn tăng, quỹ VND giảm' : 'Đã bán ngoại tệ — tồn giảm, quỹ VND tăng');
      form.resetFields();
    } catch (e: any) {
      message.error(e?.response?.data?.message ?? 'Giao dịch thất bại');
    }
  };

  const branchCode = (id: string) => branches.find((b) => b.id === id)?.code ?? id.slice(0, 6);

  const cols: ColumnsType<FxTransactionDto> = [
    { title: 'Loại', dataIndex: 'isBuy', render: (v) => <Tag color={v ? 'blue' : 'volcano'}>{v ? 'MUA' : 'BÁN'}</Tag> },
    { title: 'CN', dataIndex: 'branchId', render: branchCode },
    { title: 'Ngoại tệ', render: (_, r) => `${money(r.fxAmount)} ${r.fxCurrency}` },
    { title: 'Tỷ giá', dataIndex: 'rate', align: 'right', render: (v) => money(Math.round(v)) },
    { title: 'Thành tiền VND', dataIndex: 'vndAmount', align: 'right', render: (v) => `${money(v)}đ` },
  ];

  const stockCols: ColumnsType<FxStockDto> = [
    { title: 'CN', dataIndex: 'branchId', render: branchCode },
    { title: 'Ngoại tệ', dataIndex: 'currency' },
    { title: 'Tồn', dataIndex: 'balance', align: 'right', render: (v) => <Typography.Text strong>{money(v)}</Typography.Text> },
  ];

  return (
    <PageScaffold
      title="Mua / Bán ngoại tệ"
      description="Mua (khách bán cho công ty): quỹ VND giảm, tồn ngoại tệ tăng. Bán: ngược lại. Không bán vượt tồn."
      moduleName="foreign-exchange"
    >
      <Row gutter={16}>
        <Col xs={24} lg={10}>
          <Card title="Giao dịch ngoại tệ" size="small" className="mb-4">
            <Form form={form} layout="vertical" onFinish={onCreate} initialValues={{ side: 'buy' }}>
              <Form.Item name="side" label="Loại giao dịch">
                <Segmented block options={[{ label: 'MUA (khách bán)', value: 'buy' }, { label: 'BÁN (khách mua)', value: 'sell' }]} />
              </Form.Item>
              <Form.Item name="branchId" label="Chi nhánh" rules={[{ required: true }]}>
                <Select placeholder="Chọn chi nhánh"
                  options={branches.filter((b) => b.type !== 'HEAD_OFFICE').map((b) => ({ value: b.id, label: `${b.code} — ${b.name}` }))} />
              </Form.Item>
              <Row gutter={8}>
                <Col span={12}><Form.Item name="fxCurrency" label="Ngoại tệ" rules={[{ required: true }]}>
                  <Select options={CURRENCIES.map((v) => ({ value: v, label: v }))} /></Form.Item></Col>
                <Col span={12}><Form.Item name="fxAmount" label="Số lượng" rules={[{ required: true }]}>
                  <InputNumber min={0} style={{ width: '100%' }} formatter={fmt} /></Form.Item></Col>
              </Row>
              <Row gutter={8}>
                <Col span={12}><Form.Item name="rate" label={side === 'buy' ? 'Giá mua' : 'Giá bán'} rules={[{ required: true }]}>
                  <InputNumber min={0} style={{ width: '100%' }} formatter={fmt} /></Form.Item></Col>
                <Col span={12}><Form.Item name="customerName" label="Khách"><Input /></Form.Item></Col>
              </Row>
              <Typography.Paragraph type="secondary">
                Thành tiền: <Typography.Text strong>{money(Math.round(amount * rate))}đ</Typography.Text>
              </Typography.Paragraph>
              <Button type="primary" htmlType="submit" icon={<SwapOutlined />} loading={create.isPending} block>
                {side === 'buy' ? 'Mua ngoại tệ' : 'Bán ngoại tệ'}
              </Button>
            </Form>
          </Card>
          <Card title="Tồn ngoại tệ (Quỹ A)" size="small">
            <Table<FxStockDto> rowKey={(r) => r.branchId + r.currency} size="small" columns={stockCols}
              dataSource={stock} pagination={false} scroll={{ y: 250 }} />
          </Card>
        </Col>
        <Col xs={24} lg={14}>
          <Card title="Giao dịch gần đây" size="small">
            <Table<FxTransactionDto> rowKey="id" loading={isLoading} columns={cols} dataSource={txns}
              scroll={{ x: 600 }} pagination={{ pageSize: 10 }} />
          </Card>
        </Col>
      </Row>
    </PageScaffold>
  );
}
