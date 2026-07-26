// Flow WU — Tạo giao dịch Western Union (nối API thật)
import { App, Alert, Button, Card, Col, Form, Input, InputNumber, Row, Segmented, Select, Table, Typography } from 'antd';
import type { ColumnsType } from 'antd/es/table';
import { SendOutlined } from '@ant-design/icons';
import { PageScaffold } from '@/shared/components/PageScaffold';
import { useBranches, useCreateWu, useWuTransactions } from '../hooks/useWu';
import type { WuTransactionDto } from '../api/wu.api';

const money = (n: number) => n.toLocaleString('vi-VN');

export function WuWorkspacePage() {
  const { message } = App.useApp();
  const { data: txns = [], isLoading } = useWuTransactions();
  const { data: branches = [] } = useBranches();
  const create = useCreateWu();
  const [form] = Form.useForm();

  // Theo dõi để tính implied rate + profit preview
  const wuUsd = Form.useWatch('wuUsdAmount', form) ?? 0;
  const wuVnd = Form.useWatch('wuVndAmount', form) ?? 0;
  const applied = Form.useWatch('appliedRate', form) ?? 0;
  const implied = wuUsd > 0 ? wuVnd / wuUsd : 0;
  const profit = (implied - applied) * wuUsd;

  const onCreate = async (v: any) => {
    try {
      await create.mutateAsync({
        ...v,
        receivedUsd: v.receivedUsd ?? 0,
        receivedVnd: v.receivedVnd ?? 0,
      });
      message.success('Đã tạo GD WU — quỹ giảm, công nợ WU tăng');
      form.resetFields();
    } catch (e: any) {
      message.error(e?.response?.data?.message ?? 'Tạo GD thất bại');
    }
  };

  const branchCode = (id: string) => branches.find((b) => b.id === id)?.code ?? id.slice(0, 6);

  const cols: ColumnsType<WuTransactionDto> = [
    { title: 'MSKH', dataIndex: 'mtcn' },
    { title: 'Khách', dataIndex: 'customerName' },
    { title: 'CN', dataIndex: 'branchId', render: branchCode },
    { title: 'USD', dataIndex: 'wuUsdAmount', align: 'right', render: money },
    { title: 'Implied', dataIndex: 'wuRate', align: 'right', render: (v) => money(Math.round(v)) },
    { title: 'Applied', dataIndex: 'appliedRate', align: 'right', render: (v) => money(Math.round(v)) },
    { title: 'Lợi nhuận', dataIndex: 'profit', align: 'right',
      render: (v) => <Typography.Text strong type={v >= 0 ? 'success' : 'danger'}>{money(Math.round(v))}đ</Typography.Text> },
  ];

  return (
    <PageScaffold
      title="Giao dịch Western Union"
      description="Tạo GD chi trả WU: trả khách → quỹ giảm, WU nợ lại công ty, lợi nhuận = (implied − applied) × USD."
      moduleName="western-union"
    >
      <Row gutter={16}>
        <Col xs={24} lg={11}>
          <Card title="Tạo giao dịch WU" size="small">
            <Form form={form} layout="vertical" onFinish={onCreate}
              initialValues={{ paidCurrency: 'USD', receivedUsd: 0, receivedVnd: 0 }}>
              <Form.Item name="branchId" label="Chi nhánh" rules={[{ required: true }]}>
                <Select placeholder="Chọn chi nhánh"
                  options={branches.filter((b) => b.type !== 'HEAD_OFFICE').map((b) => ({ value: b.id, label: `${b.code} — ${b.name}` }))} />
              </Form.Item>
              <Row gutter={8}>
                <Col span={12}><Form.Item name="mtcn" label="MSKH (10 số)" rules={[{ required: true }, { pattern: /^\d{10}$/, message: '10 chữ số' }]}>
                  <Input maxLength={10} placeholder="1234567890" /></Form.Item></Col>
                <Col span={12}><Form.Item name="customerName" label="Tên khách"><Input /></Form.Item></Col>
              </Row>
              <Row gutter={8}>
                <Col span={12}><Form.Item name="wuUsdAmount" label="Amount USD (WU)" rules={[{ required: true }]}>
                  <InputNumber min={0} style={{ width: '100%' }} /></Form.Item></Col>
                <Col span={12}><Form.Item name="wuVndAmount" label="Amount VND (WU)" rules={[{ required: true }]}>
                  <InputNumber min={0} style={{ width: '100%' }} formatter={(v) => `${v}`.replace(/\B(?=(\d{3})+(?!\d))/g, ',')} /></Form.Item></Col>
              </Row>
              <Row gutter={8}>
                <Col span={12}><Form.Item name="receivedVnd" label="Trả khách VND">
                  <InputNumber min={0} style={{ width: '100%' }} formatter={(v) => `${v}`.replace(/\B(?=(\d{3})+(?!\d))/g, ',')} /></Form.Item></Col>
                <Col span={12}><Form.Item name="receivedUsd" label="Trả khách USD">
                  <InputNumber min={0} style={{ width: '100%' }} /></Form.Item></Col>
              </Row>
              <Row gutter={8}>
                <Col span={12}><Form.Item name="appliedRate" label="Applied Rate" rules={[{ required: true }]}>
                  <InputNumber min={0} style={{ width: '100%' }} /></Form.Item></Col>
                <Col span={12}><Form.Item name="paidCurrency" label="Paid Currency (WU hoàn)">
                  <Segmented options={['USD', 'VND']} /></Form.Item></Col>
              </Row>

              <Alert type={profit >= 0 ? 'success' : 'warning'} showIcon className="mb-3"
                message={`WU Implied Rate: ${money(Math.round(implied))} — Lợi nhuận dự kiến: ${money(Math.round(profit))}đ`} />

              <Button type="primary" htmlType="submit" icon={<SendOutlined />} loading={create.isPending} block>
                Tạo giao dịch
              </Button>
            </Form>
          </Card>
        </Col>
        <Col xs={24} lg={13}>
          <Card title="Giao dịch WU gần đây" size="small">
            <Table<WuTransactionDto> rowKey="id" loading={isLoading} columns={cols} dataSource={txns}
              scroll={{ x: 700 }} pagination={{ pageSize: 8 }} />
          </Card>
        </Col>
      </Row>
    </PageScaffold>
  );
}
