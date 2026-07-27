// Flow Ngân hàng — Ghi nhận tiền WU/MG về (khép vòng công nợ)
import { App, Alert, Button, Card, Col, Form, Input, InputNumber, Row, Select, Table, Tag, Typography } from 'antd';
import type { ColumnsType } from 'antd/es/table';
import { BankOutlined } from '@ant-design/icons';
import { PageScaffold } from '@/shared/components/PageScaffold';
import { useBankAccounts, useBankMovements, useDebtsForSettle, useReceiveMoney } from '../hooks/useBank';
import type { BankAccountDto, BankMovementDto, DebtAccountDto } from '../api/bank.api';

const money = (n: number) => n.toLocaleString('vi-VN');
const fmt = (v: any) => `${v}`.replace(/\B(?=(\d{3})+(?!\d))/g, ',');

export function BankReceivePage() {
  const { message } = App.useApp();
  const { data: accounts = [] } = useBankAccounts();
  const { data: movements = [], isLoading } = useBankMovements();
  const { data: debts = [] } = useDebtsForSettle();
  const receive = useReceiveMoney();
  const [form] = Form.useForm();

  const openDebts = debts.filter((d) => d.outstanding > 0);

  const onReceive = async (v: any) => {
    try {
      await receive.mutateAsync(v);
      message.success('Đã ghi nhận tiền về — số dư NH tăng, công nợ giảm');
      form.resetFields();
    } catch (e: any) {
      message.error(e?.response?.data?.message ?? 'Ghi nhận thất bại');
    }
  };

  const acctCols: ColumnsType<BankAccountDto> = [
    { title: 'Ngân hàng', dataIndex: 'bankCode', render: (v) => <Tag color="blue">{v}</Tag> },
    { title: 'Số TK', dataIndex: 'accountNo' },
    { title: 'Loại tiền', dataIndex: 'currencyCode' },
    { title: 'Số dư', dataIndex: 'currentBalance', align: 'right',
      render: (v, r) => <Typography.Text strong>{money(v)} {r.currencyCode}</Typography.Text> },
  ];

  const moveCols: ColumnsType<BankMovementDto> = [
    { title: 'Mã', dataIndex: 'movementNo' },
    { title: 'Loại', dataIndex: 'movementType', render: (v) => <Tag color="green">{v === 'DEPOSIT' ? 'Tiền vào' : v}</Tag> },
    { title: 'Số tiền', dataIndex: 'amount', align: 'right', render: (v, r) => `${money(v)} ${r.currencyCode}` },
    { title: 'Số dư sau', dataIndex: 'balanceAfter', align: 'right', render: money },
    { title: 'Tham chiếu', dataIndex: 'bankReference' },
  ];

  return (
    <PageScaffold
      title="Ngân hàng — Tiền WU/MG về"
      description="Ghi nhận tiền WU/MG chuyển về tài khoản → số dư ngân hàng tăng, công nợ tương ứng giảm."
      moduleName="bank-management"
    >
      <Row gutter={16}>
        <Col xs={24} lg={10}>
          <Card title="Ghi nhận tiền về" size="small" className="mb-4">
            <Form form={form} layout="vertical" onFinish={onReceive}>
              <Form.Item name="bankAccountId" label="Tài khoản ngân hàng" rules={[{ required: true }]}>
                <Select placeholder="Chọn TK nhận"
                  options={accounts.map((a) => ({ value: a.id, label: `${a.bankCode} ${a.currencyCode} — ${a.accountNo}` }))} />
              </Form.Item>
              <Form.Item name="debtAccountId" label="Trừ vào công nợ" rules={[{ required: true }]}>
                <Select placeholder="Chọn sổ công nợ"
                  options={openDebts.map((d) => ({ value: d.id, label: `${d.providerCode} ${d.currencyCode} — còn ${money(d.outstanding)}` }))} />
              </Form.Item>
              <Row gutter={8}>
                <Col span={12}><Form.Item name="amount" label="Số tiền về" rules={[{ required: true }]}>
                  <InputNumber min={0} style={{ width: '100%' }} formatter={fmt} /></Form.Item></Col>
                <Col span={12}><Form.Item name="bankReference" label="Mã tham chiếu"><Input /></Form.Item></Col>
              </Row>
              <Alert type="info" showIcon className="mb-3"
                message="Số dư NH tăng + công nợ WU/MG giảm cùng lúc (khép vòng)." />
              <Button type="primary" htmlType="submit" icon={<BankOutlined />} loading={receive.isPending} block>
                Ghi nhận tiền về
              </Button>
            </Form>
          </Card>
          <Card title="Số dư tài khoản ngân hàng" size="small">
            <Table<BankAccountDto> rowKey="id" size="small" columns={acctCols} dataSource={accounts} pagination={false} />
          </Card>
        </Col>
        <Col xs={24} lg={14}>
          <Card title="Lịch sử tiền về" size="small">
            <Table<BankMovementDto> rowKey="id" loading={isLoading} columns={moveCols} dataSource={movements}
              scroll={{ x: 600 }} pagination={{ pageSize: 10 }} />
          </Card>
        </Col>
      </Row>
    </PageScaffold>
  );
}
