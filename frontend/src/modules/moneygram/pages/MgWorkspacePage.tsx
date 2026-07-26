// Flow MG — Tạo giao dịch MoneyGram (nối API thật)
import { App, Alert, Button, Card, Col, Form, Input, InputNumber, Row, Segmented, Select, Table, Typography } from 'antd';
import type { ColumnsType } from 'antd/es/table';
import { SendOutlined } from '@ant-design/icons';
import { PageScaffold } from '@/shared/components/PageScaffold';
import { useBranches, useCreateMg, useMgTransactions } from '../hooks/useMg';
import type { MgTransactionDto } from '../api/mg.api';

const money = (n: number) => n.toLocaleString('vi-VN');
const fmt = (v: any) => `${v}`.replace(/\B(?=(\d{3})+(?!\d))/g, ',');

export function MgWorkspacePage() {
  const { message } = App.useApp();
  const { data: txns = [], isLoading } = useMgTransactions();
  const { data: branches = [] } = useBranches();
  const create = useCreateMg();
  const [form] = Form.useForm();

  const mgUsd = Form.useWatch('mgUsdAmount', form) ?? 0;
  const mgVnd = Form.useWatch('mgVndAmount', form) ?? 0;
  const applied = Form.useWatch('appliedRate', form) ?? 0;
  const implied = mgUsd > 0 ? mgVnd / mgUsd : 0;
  const profit = (implied - applied) * mgUsd;

  const onCreate = async (v: any) => {
    try {
      await create.mutateAsync({ ...v, payoutAmount: v.payoutAmount ?? 0 });
      message.success('Đã tạo GD MG — quỹ giảm, công nợ MG tăng');
      form.resetFields();
    } catch (e: any) {
      message.error(e?.response?.data?.message ?? 'Tạo GD thất bại');
    }
  };

  const branchCode = (id: string) => branches.find((b) => b.id === id)?.code ?? id.slice(0, 6);

  const cols: ColumnsType<MgTransactionDto> = [
    { title: 'Reference No', dataIndex: 'referenceNo' },
    { title: 'Khách', dataIndex: 'customerName' },
    { title: 'CN', dataIndex: 'branchId', render: branchCode },
    { title: 'USD', dataIndex: 'mgUsdAmount', align: 'right', render: money },
    { title: 'Implied', dataIndex: 'mgRate', align: 'right', render: (v) => money(Math.round(v)) },
    { title: 'Applied', dataIndex: 'appliedRate', align: 'right', render: (v) => money(Math.round(v)) },
    { title: 'Lợi nhuận', dataIndex: 'profit', align: 'right',
      render: (v) => <Typography.Text strong type={v >= 0 ? 'success' : 'danger'}>{money(Math.round(v))}đ</Typography.Text> },
  ];

  return (
    <PageScaffold
      title="Giao dịch MoneyGram"
      description="Giống Western Union, khóa = Reference Number (mỗi Ref chỉ xử lý 1 lần)."
      moduleName="moneygram"
    >
      <Row gutter={16}>
        <Col xs={24} lg={11}>
          <Card title="Tạo giao dịch MG" size="small">
            <Form form={form} layout="vertical" onFinish={onCreate}
              initialValues={{ paidCurrency: 'USD', payoutCurrency: 'VND', payoutAmount: 0 }}>
              <Form.Item name="branchId" label="Chi nhánh" rules={[{ required: true }]}>
                <Select placeholder="Chọn chi nhánh"
                  options={branches.filter((b) => b.type !== 'HEAD_OFFICE').map((b) => ({ value: b.id, label: `${b.code} — ${b.name}` }))} />
              </Form.Item>
              <Row gutter={8}>
                <Col span={12}><Form.Item name="referenceNo" label="Reference Number" rules={[{ required: true }, { min: 6, message: 'tối thiểu 6 ký tự' }]}>
                  <Input placeholder="REF12345678" /></Form.Item></Col>
                <Col span={12}><Form.Item name="customerName" label="Tên khách"><Input /></Form.Item></Col>
              </Row>
              <Row gutter={8}>
                <Col span={12}><Form.Item name="mgUsdAmount" label="Amount USD (MG)" rules={[{ required: true }]}>
                  <InputNumber min={0} style={{ width: '100%' }} /></Form.Item></Col>
                <Col span={12}><Form.Item name="mgVndAmount" label="Amount VND (MG)" rules={[{ required: true }]}>
                  <InputNumber min={0} style={{ width: '100%' }} formatter={fmt} /></Form.Item></Col>
              </Row>
              <Row gutter={8}>
                <Col span={12}><Form.Item name="payoutCurrency" label="Trả khách bằng">
                  <Segmented options={['VND', 'USD']} /></Form.Item></Col>
                <Col span={12}><Form.Item name="payoutAmount" label="Số tiền trả khách" rules={[{ required: true }]}>
                  <InputNumber min={0} style={{ width: '100%' }} formatter={fmt} /></Form.Item></Col>
              </Row>
              <Row gutter={8}>
                <Col span={12}><Form.Item name="appliedRate" label="Applied Rate" rules={[{ required: true }]}>
                  <InputNumber min={0} style={{ width: '100%' }} /></Form.Item></Col>
                <Col span={12}><Form.Item name="paidCurrency" label="Paid Currency (MG hoàn)">
                  <Segmented options={['USD', 'VND']} /></Form.Item></Col>
              </Row>

              <Alert type={profit >= 0 ? 'success' : 'warning'} showIcon className="mb-3"
                message={`MG Implied Rate: ${money(Math.round(implied))} — Lợi nhuận dự kiến: ${money(Math.round(profit))}đ`} />

              <Button type="primary" htmlType="submit" icon={<SendOutlined />} loading={create.isPending} block>
                Tạo giao dịch
              </Button>
            </Form>
          </Card>
        </Col>
        <Col xs={24} lg={13}>
          <Card title="Giao dịch MG gần đây" size="small">
            <Table<MgTransactionDto> rowKey="id" loading={isLoading} columns={cols} dataSource={txns}
              scroll={{ x: 700 }} pagination={{ pageSize: 8 }} />
          </Card>
        </Col>
      </Row>
    </PageScaffold>
  );
}
