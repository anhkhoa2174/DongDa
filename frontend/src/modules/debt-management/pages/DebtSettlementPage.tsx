// Flow 2 — Giải quyết công nợ WU/MG (nối API thật)
import { useState } from 'react';
import {
  App, Button, Card, Form, InputNumber, Modal, Select, Space, Table, Tag, Typography,
} from 'antd';
import type { ColumnsType } from 'antd/es/table';
import { DollarOutlined, PlusOutlined } from '@ant-design/icons';
import { PageScaffold } from '@/shared/components/PageScaffold';
import { useAuthStore } from '@/modules/auth/model/auth.store';
import { hasPermission } from '@/modules/auth/model/permissions';
import {
  useBranches, useDebtMovements, useDebts, useRecordDebt, useSettleDebt,
} from '../hooks/useDebts';
import type { DebtAccountSummaryDto, DebtStatus } from '../api/debt.api';

const CURRENCIES = ['USD', 'VND', 'EUR', 'JPY'];
const STATUS: Record<DebtStatus, { color: string; label: string }> = {
  PENDING: { color: 'gold', label: 'Chưa trả' },
  PARTIALLY_SETTLED: { color: 'blue', label: 'Trả một phần' },
  SETTLED: { color: 'green', label: 'Đã trả hết' },
};

const money = (n: number) => n.toLocaleString('vi-VN');

export function DebtSettlementPage() {
  const { message } = App.useApp();
  const role = useAuthStore((s) => s.user?.role);
  const canSettle = hasPermission(role, 'fund.transfer'); // GĐ/KTTH

  const { data: debts = [], isLoading } = useDebts();
  const { data: branches = [] } = useBranches();
  const settle = useSettleDebt();
  const record = useRecordDebt();

  const [settleTarget, setSettleTarget] = useState<DebtAccountSummaryDto | null>(null);
  const [movementTarget, setMovementTarget] = useState<DebtAccountSummaryDto | null>(null);
  const { data: movements = [] } = useDebtMovements(movementTarget?.id ?? null);
  const [settleForm] = Form.useForm();
  const [recordForm] = Form.useForm();

  const onSettle = async (v: { amount: number; description?: string }) => {
    if (!settleTarget) return;
    try {
      await settle.mutateAsync({ id: settleTarget.id, ...v });
      message.success('Đã ghi nhận trả nợ');
      setSettleTarget(null);
      settleForm.resetFields();
    } catch (e: any) {
      message.error(e?.response?.data?.message ?? 'Trả nợ thất bại');
    }
  };

  const onRecord = async (v: any) => {
    try {
      await record.mutateAsync(v);
      message.success('Đã ghi nhận công nợ (giả lập GD WU/MG)');
      recordForm.resetFields();
    } catch (e: any) {
      message.error(e?.response?.data?.message ?? 'Ghi nợ thất bại');
    }
  };

  const columns: ColumnsType<DebtAccountSummaryDto> = [
    { title: 'Sổ nợ', dataIndex: 'name' },
    { title: 'Đối tác', dataIndex: 'providerCode', render: (v) => <Tag>{v}</Tag> },
    { title: 'Loại tiền', dataIndex: 'currencyCode' },
    { title: 'Tổng nợ', dataIndex: 'totalDebt', align: 'right', render: (v, r) => `${money(v)} ${r.currencyCode}` },
    { title: 'Đã trả', dataIndex: 'totalSettled', align: 'right', render: (v, r) => `${money(v)} ${r.currencyCode}` },
    { title: 'Còn nợ', dataIndex: 'outstanding', align: 'right',
      render: (v, r) => <Typography.Text strong type={v > 0 ? 'danger' : undefined}>{money(v)} {r.currencyCode}</Typography.Text> },
    { title: 'Trạng thái', dataIndex: 'status', render: (s: DebtStatus) => <Tag color={STATUS[s].color}>{STATUS[s].label}</Tag> },
    {
      title: 'Thao tác', key: 'action', fixed: 'right',
      render: (_, r) => (
        <Space>
          <Button size="small" onClick={() => setMovementTarget(r)}>Lịch sử</Button>
          {canSettle && r.outstanding > 0 && (
            <Button type="primary" size="small" icon={<DollarOutlined />} onClick={() => setSettleTarget(r)}>
              Trả nợ
            </Button>
          )}
        </Space>
      ),
    },
  ];

  return (
    <PageScaffold
      title="Giải quyết công nợ WU/MG"
      description="Công nợ sinh từ giao dịch WU/MG. Trả nợ dần: Chưa trả → Trả một phần → Đã trả hết."
      moduleName="debt-management"
    >
      {canSettle && (
        <Card title="Ghi nợ (giả lập giao dịch WU/MG — tạm thời để test)" size="small" className="mb-4">
          <Form form={recordForm} layout="inline" onFinish={onRecord}>
            <Form.Item name="branchId" rules={[{ required: true }]}>
              <Select placeholder="Chi nhánh" style={{ width: 200 }}
                options={branches.map((b) => ({ value: b.id, label: `${b.code} — ${b.name}` }))} />
            </Form.Item>
            <Form.Item name="providerCode" rules={[{ required: true }]}>
              <Select placeholder="Đối tác" style={{ width: 110 }}
                options={['WU', 'MG'].map((v) => ({ value: v, label: v }))} />
            </Form.Item>
            <Form.Item name="currencyCode" rules={[{ required: true }]}>
              <Select placeholder="Loại tiền" style={{ width: 110 }}
                options={CURRENCIES.map((v) => ({ value: v, label: v }))} />
            </Form.Item>
            <Form.Item name="amount" rules={[{ required: true }]}>
              <InputNumber placeholder="Số tiền" min={0} style={{ width: 140 }}
                formatter={(v) => `${v}`.replace(/\B(?=(\d{3})+(?!\d))/g, ',')} />
            </Form.Item>
            <Form.Item>
              <Button type="primary" htmlType="submit" icon={<PlusOutlined />} loading={record.isPending}>
                Ghi nợ
              </Button>
            </Form.Item>
          </Form>
        </Card>
      )}

      <Card size="small">
        <Table<DebtAccountSummaryDto>
          rowKey="id" loading={isLoading} columns={columns} dataSource={debts}
          scroll={{ x: 1000 }} pagination={{ pageSize: 10 }}
        />
      </Card>

      {/* Modal trả nợ */}
      <Modal
        title={`Trả nợ — ${settleTarget?.name ?? ''}`}
        open={!!settleTarget}
        onCancel={() => setSettleTarget(null)}
        onOk={() => settleForm.submit()}
        confirmLoading={settle.isPending}
        okText="Xác nhận trả"
      >
        {settleTarget && (
          <>
            <Typography.Paragraph>
              Còn nợ: <Typography.Text strong>{money(settleTarget.outstanding)} {settleTarget.currencyCode}</Typography.Text>
            </Typography.Paragraph>
            <Form form={settleForm} layout="vertical" onFinish={onSettle}>
              <Form.Item name="amount" label="Số tiền trả" rules={[{ required: true }]}>
                <InputNumber min={0} max={settleTarget.outstanding} style={{ width: '100%' }}
                  formatter={(v) => `${v}`.replace(/\B(?=(\d{3})+(?!\d))/g, ',')} />
              </Form.Item>
            </Form>
          </>
        )}
      </Modal>

      {/* Modal lịch sử */}
      <Modal
        title={`Lịch sử biến động — ${movementTarget?.name ?? ''}`}
        open={!!movementTarget}
        onCancel={() => setMovementTarget(null)}
        footer={null}
        width={600}
      >
        <Table
          rowKey="id" size="small" pagination={false} dataSource={movements}
          columns={[
            { title: 'Loại', dataIndex: 'movementType',
              render: (v) => <Tag color={v === 'SETTLEMENT' ? 'green' : 'gold'}>{v === 'SETTLEMENT' ? 'Trả nợ' : 'Phát sinh nợ'}</Tag> },
            { title: 'Số tiền', dataIndex: 'amount', align: 'right', render: (v, r: any) => `${money(v)} ${r.currencyCode}` },
            { title: 'Ngày', dataIndex: 'businessDate', render: (v) => new Date(v).toLocaleDateString('vi-VN') },
          ]}
        />
      </Modal>
    </PageScaffold>
  );
}
