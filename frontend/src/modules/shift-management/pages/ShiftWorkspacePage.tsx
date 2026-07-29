// Ca làm việc + Kiểm quỹ (nối API thật) — F8
import { useState } from 'react';
import { App, Alert, Button, Card, Col, Descriptions, Form, InputNumber, Result, Row, Select, Table, Tag, Typography } from 'antd';
import type { ColumnsType } from 'antd/es/table';
import { LockOutlined, PlayCircleOutlined } from '@ant-design/icons';
import { PageScaffold } from '@/shared/components/PageScaffold';
import { useBranches, useCloseShift, useCurrentShift, useOpenShift } from '../hooks/useShift';
import type { CashCountLineDto } from '../api/shift.api';

const money = (n: number) => n.toLocaleString('vi-VN');
const fmt = (v: any) => `${v}`.replace(/\B(?=(\d{3})+(?!\d))/g, ',');

function varianceTag(v: number) {
  if (Math.abs(v) < 0.01) return <Tag color="green">KHỚP</Tag>;
  return v > 0 ? <Tag color="blue">THỪA {money(v)}</Tag> : <Tag color="red">THIẾU {money(-v)}</Tag>;
}

const countCols: ColumnsType<CashCountLineDto> = [
  { title: 'Loại tiền', dataIndex: 'currencyCode' },
  { title: 'Tồn hệ thống', dataIndex: 'systemAmount', align: 'right', render: money },
  { title: 'Thực đếm', dataIndex: 'actualAmount', align: 'right', render: money },
  { title: 'Chênh lệch', dataIndex: 'variance', align: 'right', render: (v) => varianceTag(v) },
];

export function ShiftWorkspacePage() {
  const { message } = App.useApp();
  const { data: branches = [] } = useBranches();
  const [branchId, setBranchId] = useState<string>();
  const { data: current, isLoading } = useCurrentShift(branchId);
  const openShift = useOpenShift();
  const closeShift = useCloseShift();
  const [openForm] = Form.useForm();
  const [closeForm] = Form.useForm();

  const shift = current?.shift;
  const openCount = current?.cashCounts?.[0];

  const onOpen = async (v: any) => {
    if (!branchId) return;
    try {
      await openShift.mutateAsync({
        branchId,
        openingCounts: [
          { currency: 'VND', actualAmount: v.vnd ?? 0 },
          { currency: 'USD', actualAmount: v.usd ?? 0 },
        ],
      });
      message.success('Đã mở ca + kiểm quỹ đầu ca');
      openForm.resetFields();
    } catch (e: any) {
      message.error(e?.response?.data?.message ?? 'Mở ca thất bại');
    }
  };

  const onClose = async (v: any) => {
    if (!shift) return;
    try {
      await closeShift.mutateAsync({
        shiftId: shift.id,
        closingCounts: [
          { currency: 'VND', actualAmount: v.vnd ?? 0 },
          { currency: 'USD', actualAmount: v.usd ?? 0 },
        ],
      });
      message.success('Đã đóng ca + kiểm quỹ cuối ca');
      closeForm.resetFields();
    } catch (e: any) {
      message.error(e?.response?.data?.message ?? 'Đóng ca thất bại');
    }
  };

  return (
    <PageScaffold
      title="Ca làm việc & Kiểm quỹ"
      description="Mở ca (đếm tiền đầu) → giao dịch bắt buộc thuộc ca → đóng ca (đếm tiền cuối, tính khớp/thừa/thiếu)."
      moduleName="shift-management"
    >
      <Card size="small" className="mb-4">
        <Select placeholder="Chọn chi nhánh" style={{ width: 300 }} value={branchId} onChange={setBranchId}
          options={branches.filter((b) => b.type !== 'HEAD_OFFICE').map((b) => ({ value: b.id, label: `${b.code} — ${b.name}` }))} />
      </Card>

      {!branchId ? (
        <Result icon={<PlayCircleOutlined />} title="Chọn chi nhánh để xem/mở ca" />
      ) : isLoading ? null : shift ? (
        // Đang có ca mở
        <Row gutter={16}>
          <Col xs={24} lg={12}>
            <Card title={<span>Ca đang mở <Tag color="green">{shift.status}</Tag></span>} size="small" className="mb-4">
              <Descriptions column={1} size="small">
                <Descriptions.Item label="Mã ca">{shift.shiftCode}</Descriptions.Item>
                <Descriptions.Item label="Mở lúc">{new Date(shift.openedAt).toLocaleString('vi-VN')}</Descriptions.Item>
              </Descriptions>
              {openCount && (
                <>
                  <Typography.Text strong>Kiểm quỹ đầu ca:</Typography.Text>
                  <Table size="small" rowKey="currencyCode" pagination={false} columns={countCols} dataSource={openCount.lines} className="mt-2" />
                </>
              )}
            </Card>
          </Col>
          <Col xs={24} lg={12}>
            <Card title={<span><LockOutlined /> Đóng ca — kiểm quỹ cuối</span>} size="small">
              <Alert type="info" showIcon className="mb-3" message="Nhập số tiền thực đếm cuối ca. Hệ thống so với tồn ledger → khớp/thừa/thiếu." />
              <Form form={closeForm} layout="vertical" onFinish={onClose}>
                <Form.Item name="vnd" label="Tiền mặt VND thực đếm" rules={[{ required: true }]}>
                  <InputNumber min={0} style={{ width: '100%' }} formatter={fmt} />
                </Form.Item>
                <Form.Item name="usd" label="Tiền mặt USD thực đếm" rules={[{ required: true }]}>
                  <InputNumber min={0} style={{ width: '100%' }} formatter={fmt} />
                </Form.Item>
                <Button danger htmlType="submit" icon={<LockOutlined />} loading={closeShift.isPending} block>
                  Đóng ca
                </Button>
              </Form>
            </Card>
          </Col>
        </Row>
      ) : (
        // Chưa có ca → mở
        <Card title={<span><PlayCircleOutlined /> Mở ca — kiểm quỹ đầu</span>} size="small" style={{ maxWidth: 480 }}>
          <Alert type="warning" showIcon className="mb-3" message="Chi nhánh chưa mở ca. Mọi giao dịch WU/MG/ngoại tệ cần ca mở." />
          <Form form={openForm} layout="vertical" onFinish={onOpen}>
            <Form.Item name="vnd" label="Tiền mặt VND đầu ca" rules={[{ required: true }]}>
              <InputNumber min={0} style={{ width: '100%' }} formatter={fmt} />
            </Form.Item>
            <Form.Item name="usd" label="Tiền mặt USD đầu ca" rules={[{ required: true }]}>
              <InputNumber min={0} style={{ width: '100%' }} formatter={fmt} />
            </Form.Item>
            <Button type="primary" htmlType="submit" icon={<PlayCircleOutlined />} loading={openShift.isPending} block>
              Mở ca
            </Button>
          </Form>
        </Card>
      )}
    </PageScaffold>
  );
}
