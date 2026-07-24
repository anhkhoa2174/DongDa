import {
  CheckCircleOutlined,
  LockOutlined,
  LoginOutlined,
  MinusCircleOutlined,
  PlusCircleOutlined,
  ReloadOutlined,
  RiseOutlined,
} from '@ant-design/icons';
import { App, Button, Card, Col, Empty, Progress, Row, Space, Table, Tag, Typography } from 'antd';
import type { ColumnsType } from 'antd/es/table';
import { PageScaffold } from '@/shared/components/PageScaffold';
import { useAuthStore } from '@/modules/auth/model/auth.store';
import { formatTime, formatUsd, formatVnd } from '@/shared/utils/formatters';
import { useShiftStore } from '../model/shift.store';
import { shiftCashFlowMock, shiftHistoryMock, shiftPayInOutMock, shiftReconciliationMock } from '../data/shiftDashboard.mock';

type PayInOutRecord = (typeof shiftPayInOutMock)[number];
type ShiftHistoryRecord = (typeof shiftHistoryMock)[number];

function formatShiftTime(value: string) {
  return formatTime(value);
}

const payInOutColumns: ColumnsType<PayInOutRecord> = [
  { title: 'Giờ', dataIndex: 'time', render: (value: string) => <Typography.Text className="font-mono">{value}</Typography.Text> },
  {
    title: 'Loại',
    dataIndex: 'type',
    render: (value: string) => <Tag color={value === 'PAY_IN' ? 'green' : 'red'}>{value === 'PAY_IN' ? 'Pay In' : 'Pay Out'}</Tag>,
  },
  {
    title: 'Số tiền',
    dataIndex: 'amount',
    align: 'right',
    render: (value: number) => <Typography.Text className={value > 0 ? 'text-emerald-600!' : 'text-rose-600!'}>{formatVnd(value)}</Typography.Text>,
  },
  { title: 'Lý do', dataIndex: 'reason' },
];

const historyColumns: ColumnsType<ShiftHistoryRecord> = [
  { title: 'Ngày', dataIndex: 'date' },
  { title: 'CN', dataIndex: 'branch' },
  { title: 'NV', dataIndex: 'cashier' },
  { title: 'Mở', dataIndex: 'openedAt', render: (value: string) => <Typography.Text className="font-mono">{value}</Typography.Text> },
  { title: 'Đóng', dataIndex: 'closedAt', render: (value: string) => <Typography.Text className="font-mono">{value}</Typography.Text> },
  { title: 'GD', dataIndex: 'transactionCount', align: 'right' },
  { title: 'Expected VND', dataIndex: 'expectedVnd', align: 'right', render: (value: number) => formatVnd(value) },
  { title: 'Actual VND', dataIndex: 'actualVnd', align: 'right', render: (value: number) => formatVnd(value) },
  {
    title: 'Diff',
    dataIndex: 'diff',
    align: 'right',
    render: (value: number) => <Typography.Text className={value === 0 ? 'text-emerald-600!' : value > 0 ? 'text-amber-600!' : 'text-rose-600!'}>{formatVnd(value)}</Typography.Text>,
  },
  {
    title: 'Trạng thái',
    dataIndex: 'status',
    render: (value: string) => {
      const meta = {
        OPEN: { label: 'Đang mở', color: 'green' },
        MATCHED: { label: 'Khớp', color: 'green' },
        LARGE_SHORTAGE: { label: 'Thiếu lớn', color: 'red' },
        SMALL_SURPLUS: { label: 'Thừa nhỏ', color: 'gold' },
      }[value] ?? { label: value, color: 'default' };

      return <Tag color={meta.color}>{meta.label}</Tag>;
    },
  },
];

export function ShiftManagementPage() {
  const { message } = App.useApp();
  const user = useAuthStore((state) => state.user);
  const currentShift = useShiftStore((state) => state.currentShift);
  const openShift = useShiftStore((state) => state.openShift);
  const clearShift = useShiftStore((state) => state.clearShift);

  const isBranchUser = user?.role === 'branch';

  const handleOpenShift = () => {
    openShift({
      branchId: user?.branchId ?? 'nct',
      branchName: user?.branchName ?? 'Chi nhánh Nguyễn Chí Thanh',
      openedBy: user?.name ?? 'Giao dịch viên',
    });
    void message.success('Đã mở ca làm việc');
  };

  if (!isBranchUser) {
    return (
      <PageScaffold
        title="Ca Làm Việc"
        description="Module ca làm việc chỉ dành cho tài khoản chi nhánh."
        moduleName="shift-management"
      >
        <Card>
          <Empty description="GĐ/KTTH/Auditor không thao tác ca tại đây" />
        </Card>
      </PageScaffold>
    );
  }

  if (!currentShift || currentShift.status !== 'OPEN') {
    return (
      <PageScaffold
        title="Ca Làm Việc"
        description="Không có ca mở thì chi nhánh chưa thể tạo giao dịch."
        moduleName="shift-management"
      >
        <Card className="min-h-[520px]">
          <div className="flex min-h-[460px] items-center justify-center">
            <Empty
              image={Empty.PRESENTED_IMAGE_SIMPLE}
              description={(
                <Space direction="vertical" size={4}>
                  <Typography.Text strong>Chưa có ca đang mở</Typography.Text>
                  <Typography.Text type="secondary">Mở ca để bắt đầu WU, MG, ngoại tệ và chuyển tiền.</Typography.Text>
                </Space>
              )}
            >
              <Button type="primary" size="large" icon={<LoginOutlined />} onClick={handleOpenShift}>
                Mở ca
              </Button>
            </Empty>
          </div>
        </Card>
      </PageScaffold>
    );
  }

  return (
    <PageScaffold
      title="Ca Làm Việc"
      description="Theo dõi ca đang mở, đối chiếu Expected/Actual/Diff và dòng tiền trong ca."
      moduleName="shift-management"
      extra={<Button icon={<ReloadOutlined />}>Làm mới ca</Button>}
    >
      <Space direction="vertical" size={16} className="w-full">
        <Card className="border-brand-100! bg-brand-50!" classNames={{ body: 'p-5!' }}>
          <div className="flex items-center justify-between gap-4 max-xl:flex-col max-xl:items-start">
            <div className="flex items-center gap-4">
              <div className="relative">
                <Progress type="circle" percent={68} size={88} strokeColor="#f5b301" />
              </div>
              <div>
                <div className="mb-1 flex items-center gap-2">
                  <Tag color="green">● Đang mở</Tag>
                  <Typography.Text type="secondary" className="text-xs!">{currentShift.branchName} · {currentShift.code}</Typography.Text>
                </div>
                <Typography.Title level={3} className="m-0!">{currentShift.openedBy} đang trực ca</Typography.Title>
                <Typography.Text type="secondary">
                  Mở: <span className="font-mono">{formatShiftTime(currentShift.openedAt)}</span> · Đã: <span className="font-mono">6h 27p</span> · Còn: <span className="font-mono">2h 28p</span>
                </Typography.Text>
              </div>
            </div>
            <Space wrap>
              <Button icon={<PlusCircleOutlined className="text-emerald-600" />} onClick={() => message.success('Pay In ghi nhận')}>Pay In</Button>
              <Button icon={<MinusCircleOutlined className="text-rose-600" />} onClick={() => message.success('Pay Out ghi nhận')}>Pay Out</Button>
              <Button danger type="primary" icon={<LockOutlined />} onClick={() => clearShift()}>Đóng ca</Button>
            </Space>
          </div>
        </Card>

        <Card title="Đối chiếu ca hiện tại">
          <Row gutter={[16, 16]}>
            <Col xs={24} lg={8}>
              <div className="rounded-lg border border-brand-100 bg-brand-50 p-5">
                <Typography.Text className="text-xs! font-semibold! uppercase text-black!">Expected (Hệ thống)</Typography.Text>
                <div className="mt-2 text-3xl font-bold text-black">{formatVnd(shiftReconciliationMock.vnd.expected)}</div>
                <Typography.Text type="secondary" className="text-xs!">Đầu ca {formatVnd(shiftReconciliationMock.vnd.openingBalance)} + thu/chi</Typography.Text>
              </div>
            </Col>
            <Col xs={24} lg={8}>
              <div className="rounded-lg border border-slate-200 bg-slate-50 p-5">
                <Typography.Text className="text-xs! font-semibold! uppercase text-slate-700!">Actual (Kiểm tiền thực)</Typography.Text>
                <div className="mt-2 text-3xl font-bold text-slate-900">{formatVnd(shiftReconciliationMock.vnd.actual)}</div>
                <Typography.Text type="secondary" className="text-xs!">Cập nhật: {shiftReconciliationMock.vnd.lastCountedAt}</Typography.Text>
              </div>
            </Col>
            <Col xs={24} lg={8}>
              <div className="rounded-lg border-2 border-emerald-500 bg-emerald-50 p-5">
                <Typography.Text className="text-xs! font-semibold! uppercase text-emerald-700!">Difference</Typography.Text>
                <div className="mt-2 text-3xl font-bold text-emerald-700">{formatVnd(shiftReconciliationMock.vnd.difference)}</div>
                <Typography.Text className="text-xs! text-emerald-700!"><CheckCircleOutlined /> Khớp hoàn toàn</Typography.Text>
              </div>
            </Col>
          </Row>

          <Row gutter={[16, 16]} className="mt-3">
            <Col xs={24} lg={8}><div className="rounded border border-brand-100 bg-brand-50 p-3"><Typography.Text className="text-xs! text-black!">USD Expected</Typography.Text><span className="float-right font-mono font-bold">{formatUsd(shiftReconciliationMock.usd.expected)}</span></div></Col>
            <Col xs={24} lg={8}><div className="rounded border border-slate-200 bg-slate-50 p-3"><Typography.Text className="text-xs! text-slate-700!">USD Actual</Typography.Text><span className="float-right font-mono font-bold">{formatUsd(shiftReconciliationMock.usd.actual)}</span></div></Col>
            <Col xs={24} lg={8}><div className="rounded border border-emerald-300 bg-emerald-50 p-3"><Typography.Text className="text-xs! text-emerald-700!">USD Diff</Typography.Text><span className="float-right font-mono font-bold text-emerald-700">{formatUsd(shiftReconciliationMock.usd.difference)}</span></div></Col>
          </Row>
        </Card>

        <Row gutter={[16, 16]}>
          <Col xs={24} xl={12}>
            <Card title={<Space><RiseOutlined className="text-emerald-600" />Dòng tiền vào ca</Space>}>
              <Space direction="vertical" className="w-full">
                {shiftCashFlowMock.map((item) => (
                  <div
                    key={item.label}
                    className={`flex justify-between rounded p-2 ${item.tone === 'in' ? 'bg-emerald-50 text-emerald-700' : item.tone === 'out' ? 'bg-rose-50 text-rose-700' : item.tone === 'total' ? 'border border-brand-700 bg-brand-100 text-black' : 'bg-slate-50'}`}
                  >
                    <span className={item.tone === 'total' ? 'font-semibold' : ''}>{item.label}</span>
                    <span className="font-mono font-semibold">{formatVnd(item.amount)}</span>
                  </div>
                ))}
              </Space>
            </Card>
          </Col>
          <Col xs={24} xl={12}>
            <Card title="Pay In / Pay Out hôm nay">
              <Table columns={payInOutColumns} dataSource={shiftPayInOutMock} pagination={false} size="small" />
            </Card>
          </Col>
        </Row>

        <Card title="Lịch sử ca làm việc">
          <Table columns={historyColumns} dataSource={shiftHistoryMock} scroll={{ x: 1100 }} pagination={false} />
        </Card>
      </Space>
    </PageScaffold>
  );
}
