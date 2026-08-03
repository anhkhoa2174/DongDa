// Ca làm việc + Kiểm quỹ (API thật) — F8
import { useMemo, useState } from 'react';
import {
  App,
  Alert,
  Button,
  Card,
  Col,
  Descriptions,
  Form,
  InputNumber,
  Modal,
  Result,
  Row,
  Spin,
  Statistic,
  Table,
  Tag,
  Typography,
} from 'antd';
import type { FormInstance } from 'antd';
import type { ColumnsType } from 'antd/es/table';
import { LockOutlined, PlayCircleOutlined, WalletOutlined } from '@ant-design/icons';
import { PageScaffold } from '@/shared/components/PageScaffold';
import { useAuthStore } from '@/modules/auth/model/auth.store';
import type { FundBalanceDto } from '@/modules/fund-transfer/api/fundTransfer.api';
import { useFundBalances } from '@/modules/fund-transfer/hooks/useFundTransfers';
import {
  formatCurrency,
  formatDateTime,
  numberInputFormatter,
  numberInputParser,
  usdInputFormatter,
  usdInputParser,
} from '@/shared/utils/formatters';
import { useCloseShift, useCurrentShift, useOpenShift } from '../hooks/useShift';
import type { CashCountLineDto, CountInput } from '../api/shift.api';

type CountFormValues = {
  counts?: Record<string, number>;
};

type CountItem = {
  key: string;
  code: string;
  name: string;
  accountType: string;
  balance: number;
};

const currencyPriority = ['VND', 'USD'];

function money(n: number, currencyCode: string) {
  return formatCurrency(n, currencyCode, currencyCode === 'VND' ? 0 : 2);
}

function varianceTag(v: number, currencyCode: string) {
  if (Math.abs(v) < 0.01) return <Tag color="green">KHỚP</Tag>;
  return v > 0
    ? <Tag color="blue">THỪA {money(v, currencyCode)}</Tag>
    : <Tag color="red">THIẾU {money(-v, currencyCode)}</Tag>;
}

function accountTypeLabel(accountType: string) {
  if (accountType === 'CASH') return 'Tiền mặt';
  if (accountType === 'FUND_A') return 'Quỹ A';
  return accountType;
}

function countItemsFromBalances(balances: FundBalanceDto[]): CountItem[] {
  return balances
    .filter((item) => {
      if (item.accountType === 'CASH') return item.currencyCode === 'VND' || item.currencyCode === 'USD';
      if (item.accountType === 'FUND_A') return item.currencyCode !== 'VND' && item.currencyCode !== 'USD';
      return false;
    })
    .map((item) => ({
      key: `${item.accountType}-${item.currencyCode}`,
      code: item.currencyCode,
      name: item.name,
      accountType: item.accountType,
      balance: item.balance,
    }))
    .sort((a, b) => {
      const ap = currencyPriority.includes(a.code) ? currencyPriority.indexOf(a.code) : 99;
      const bp = currencyPriority.includes(b.code) ? currencyPriority.indexOf(b.code) : 99;
      return ap - bp || a.code.localeCompare(b.code) || a.name.localeCompare(b.name);
    });
}

function initialCountValues(items: CountItem[]) {
  return {
    counts: Object.fromEntries(items.map((item) => [item.code, item.balance])),
  };
}

function countLines(values: CountFormValues, items: CountItem[]): CountInput[] {
  return items.map((item) => ({
    currency: item.code,
    actualAmount: Number(values.counts?.[item.code] ?? 0),
  }));
}

function inputProps(currencyCode: string) {
  if (currencyCode === 'USD') {
    return { precision: 2, formatter: usdInputFormatter, parser: usdInputParser };
  }
  return {
    precision: currencyCode === 'VND' ? 0 : 2,
    formatter: numberInputFormatter,
    parser: numberInputParser,
  };
}

const countCols: ColumnsType<CashCountLineDto> = [
  { title: 'Loại tiền', dataIndex: 'currencyCode' },
  {
    title: 'Tồn hệ thống',
    dataIndex: 'systemAmount',
    align: 'right',
    render: (value, row) => money(Number(value), row.currencyCode),
  },
  {
    title: 'Thực đếm',
    dataIndex: 'actualAmount',
    align: 'right',
    render: (value, row) => money(Number(value), row.currencyCode),
  },
  {
    title: 'Chênh lệch',
    dataIndex: 'variance',
    align: 'right',
    render: (value, row) => varianceTag(Number(value), row.currencyCode),
  },
];

export function ShiftWorkspacePage() {
  const { message } = App.useApp();
  const user = useAuthStore((state) => state.user);
  const branchId = user?.branchId;
  const branchName = user?.branchName ?? 'Chi nhánh đang làm việc';
  const { data: current, isLoading } = useCurrentShift(branchId);
  const { data: balances = [], isLoading: isLoadingBalances } = useFundBalances(branchId);
  const openShift = useOpenShift();
  const closeShift = useCloseShift();
  const [openForm] = Form.useForm<CountFormValues>();
  const [closeForm] = Form.useForm<CountFormValues>();
  const [isOpenModalOpen, setIsOpenModalOpen] = useState(false);
  const [isCloseModalOpen, setIsCloseModalOpen] = useState(false);

  const countItems = useMemo(() => countItemsFromBalances(balances), [balances]);
  const shift = current?.shift;
  const openCount = current?.cashCounts?.[0];
  const latestCount = current?.cashCounts?.[current.cashCounts.length - 1];
  const isBusy = isLoading || isLoadingBalances;

  const showOpenModal = () => {
    openForm.setFieldsValue(initialCountValues(countItems));
    setIsOpenModalOpen(true);
  };

  const showCloseModal = () => {
    closeForm.setFieldsValue(initialCountValues(countItems));
    setIsCloseModalOpen(true);
  };

  const onOpen = async (values: CountFormValues) => {
    if (!branchId) return;
    try {
      await openShift.mutateAsync({
        branchId,
        openingCounts: countLines(values, countItems),
      });
      message.success('Đã mở ca và ghi nhận kiểm quỹ đầu ca');
      setIsOpenModalOpen(false);
      openForm.resetFields();
    } catch (e: any) {
      message.error(e?.response?.data?.message ?? 'Mở ca thất bại');
    }
  };

  const onClose = async (values: CountFormValues) => {
    if (!shift) return;
    try {
      await closeShift.mutateAsync({
        shiftId: shift.id,
        branchId,
        closingCounts: countLines(values, countItems),
      });
      message.success('Đã đóng ca và ghi nhận kiểm quỹ cuối ca');
      setIsCloseModalOpen(false);
      closeForm.resetFields();
    } catch (e: any) {
      message.error(e?.response?.data?.message ?? 'Đóng ca thất bại');
    }
  };

  return (
    <PageScaffold
      title="Ca làm việc & Kiểm quỹ"
      description="Staff xác nhận tồn quỹ đầu ca để mở ca, tạo giao dịch trong ca mở, rồi kiểm quỹ cuối ca khi đóng."
      moduleName="shift-management"
    >
      {!branchId ? (
        <Result
          status="warning"
          title="Tài khoản chưa gắn chi nhánh"
          subTitle="Staff cần được liên kết với một chi nhánh trước khi mở ca và tạo giao dịch."
        />
      ) : isBusy ? (
        <Card>
          <Spin /> <Typography.Text className="ml-2">Đang tải trạng thái ca và tồn quỹ...</Typography.Text>
        </Card>
      ) : (
        <>
          <Card className="mb-4 shift-status-card">
            <Row gutter={[20, 20]} align="middle">
              <Col xs={24} lg={10}>
                <Typography.Text type="secondary">Chi nhánh</Typography.Text>
                <Typography.Title level={3} className="!mt-1 !mb-2">
                  {branchName}
                </Typography.Title>
                {shift ? (
                  <Tag color="green">CA ĐANG MỞ</Tag>
                ) : (
                  <Tag color="gold">CHƯA MỞ CA</Tag>
                )}
              </Col>
              <Col xs={24} lg={14}>
                <Row gutter={[12, 12]}>
                  <Col xs={24} md={8}>
                    <Statistic title="Trạng thái ca" value={shift ? 'OPEN' : 'Chưa mở'} />
                  </Col>
                  <Col xs={24} md={8}>
                    <Statistic title="Mã ca" value={shift?.shiftCode ?? '—'} />
                  </Col>
                  <Col xs={24} md={8}>
                    <Statistic title="Mở lúc" value={shift ? formatDateTime(shift.openedAt) : '—'} />
                  </Col>
                </Row>
              </Col>
            </Row>
          </Card>

          <Row gutter={[16, 16]}>
            <Col xs={24} lg={shift ? 14 : 16}>
              <Card
                title={<span><WalletOutlined /> Tồn quỹ hệ thống</span>}
                extra={<Typography.Text type="secondary">VND, USD và Quỹ A</Typography.Text>}
              >
                <FundBalanceSummary items={countItems} />
              </Card>
            </Col>

            <Col xs={24} lg={shift ? 10 : 8}>
              {shift ? (
                <Card title={<span><LockOutlined /> Đóng ca</span>}>
                  <Descriptions column={1} size="small" className="mb-3">
                    <Descriptions.Item label="Mã ca">{shift.shiftCode}</Descriptions.Item>
                    <Descriptions.Item label="Mở lúc">{formatDateTime(shift.openedAt)}</Descriptions.Item>
                  </Descriptions>
                  <Alert
                    type="info"
                    showIcon
                    className="mb-4"
                    message="Khi đóng ca, nhập số thực đếm. Hệ thống sẽ đối chiếu và thông báo sai lệch cho GĐ/KTTH."
                  />
                  <Button danger icon={<LockOutlined />} onClick={showCloseModal} block>
                    Kiểm quỹ và đóng ca
                  </Button>
                </Card>
              ) : (
                <Card title={<span><PlayCircleOutlined /> Mở ca</span>}>
                  <Alert
                    type="warning"
                    showIcon
                    className="mb-4"
                    message="Chưa mở ca nên trang giao dịch sẽ yêu cầu mở ca trước."
                    description="Bấm mở ca để xác nhận tồn quỹ đang ghi nhận trên hệ thống."
                  />
                  <Button type="primary" icon={<PlayCircleOutlined />} onClick={showOpenModal} disabled={countItems.length === 0} block>
                    Mở ca
                  </Button>
                </Card>
              )}
            </Col>
          </Row>

          {openCount && (
            <Card title="Kiểm quỹ đầu ca" className="mt-4">
              <Table size="small" rowKey="currencyCode" pagination={false} columns={countCols} dataSource={openCount.lines} />
            </Card>
          )}

          {latestCount && latestCount.id !== openCount?.id && (
            <Card title="Kiểm quỹ gần nhất" className="mt-4">
              <Table size="small" rowKey="currencyCode" pagination={false} columns={countCols} dataSource={latestCount.lines} />
            </Card>
          )}

          <CountModal
            title="Xác nhận tồn đầu ca"
            open={isOpenModalOpen}
            form={openForm}
            items={countItems}
            alertType="warning"
            alertMessage="Kiểm tra tiền thực tế tại quầy trước khi mở ca."
            submitText="Xác nhận và mở ca"
            loading={openShift.isPending}
            onCancel={() => setIsOpenModalOpen(false)}
            onFinish={onOpen}
          />

          <CountModal
            title="Kiểm quỹ đóng ca"
            open={isCloseModalOpen}
            form={closeForm}
            items={countItems}
            alertType="info"
            alertMessage="Nhập số tiền thực đếm cuối ca. Sai lệch sẽ được lưu và gửi thông báo cho GĐ/KTTH."
            submitText="Đóng ca"
            loading={closeShift.isPending}
            danger
            onCancel={() => setIsCloseModalOpen(false)}
            onFinish={onClose}
          />
        </>
      )}
    </PageScaffold>
  );
}

function FundBalanceSummary({ items }: { items: CountItem[] }) {
  if (items.length === 0) {
    return <Alert type="warning" showIcon message="Chi nhánh chưa có sổ tiền mặt hoặc Quỹ A để kiểm quỹ." />;
  }

  return (
    <Row gutter={[12, 12]}>
      {items.map((item) => (
        <Col xs={24} sm={12} xl={8} key={item.key}>
          <Card size="small" className="h-full">
            <Typography.Text type="secondary">{accountTypeLabel(item.accountType)}</Typography.Text>
            <Typography.Title level={4} className="!mt-1 !mb-0">
              {money(item.balance, item.code)}
            </Typography.Title>
            <Typography.Text type="secondary">{item.name}</Typography.Text>
          </Card>
        </Col>
      ))}
    </Row>
  );
}

function CountModal({
  title,
  open,
  form,
  items,
  alertType,
  alertMessage,
  submitText,
  loading,
  danger,
  onCancel,
  onFinish,
}: {
  title: string;
  open: boolean;
  form: FormInstance<CountFormValues>;
  items: CountItem[];
  alertType: 'info' | 'warning';
  alertMessage: string;
  submitText: string;
  loading: boolean;
  danger?: boolean;
  onCancel: () => void;
  onFinish: (values: CountFormValues) => void;
}) {
  return (
    <Modal title={title} open={open} onCancel={onCancel} footer={null} width={760} destroyOnClose>
      <Alert type={alertType} showIcon className="mb-4" message={alertMessage} />
      <Form form={form} layout="vertical" onFinish={onFinish}>
        <Row gutter={[12, 12]}>
          {items.map((item) => (
            <Col xs={24} md={12} key={item.key}>
              <Card size="small">
                <Typography.Text type="secondary">
                  {accountTypeLabel(item.accountType)} · {item.name}
                </Typography.Text>
                <Form.Item
                  name={['counts', item.code]}
                  label={`Thực đếm ${item.code}`}
                  rules={[{ required: true, message: `Nhập số thực đếm ${item.code}` }]}
                  className="!mb-0 !mt-2"
                >
                  <InputNumber
                    min={0}
                    className="w-full"
                    addonAfter={item.code}
                    {...inputProps(item.code)}
                  />
                </Form.Item>
              </Card>
            </Col>
          ))}
        </Row>
        <Button
          type={danger ? 'default' : 'primary'}
          danger={danger}
          htmlType="submit"
          icon={danger ? <LockOutlined /> : <PlayCircleOutlined />}
          loading={loading}
          className="mt-4"
          disabled={items.length === 0}
          block
        >
          {submitText}
        </Button>
      </Form>
    </Modal>
  );
}
