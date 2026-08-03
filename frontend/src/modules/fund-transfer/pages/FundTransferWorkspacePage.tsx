import {
  DeleteOutlined,
  PlusOutlined,
  SafetyCertificateOutlined,
  SendOutlined,
  ShopOutlined,
  UserOutlined,
} from '@ant-design/icons';
import {
  App,
  Button,
  Card,
  Col,
  Form,
  InputNumber,
  Popconfirm,
  Row,
  Select,
  Space,
  Steps,
  Table,
  Tag,
  Typography,
} from 'antd';
import type { ColumnsType } from 'antd/es/table';
import { useEffect } from 'react';
import { useSearchParams } from 'react-router-dom';
import { PageScaffold } from '@/shared/components/PageScaffold';
import { useAuthStore } from '@/modules/auth/model/auth.store';
import {
  formatCurrency,
  formatDateTime,
  numberInputFormatter,
  numberInputParser,
} from '@/shared/utils/formatters';
import {
  useBranches,
  useConfirmTransfer,
  useCreateTransfer,
  useFundBalances,
  useFundTransfers,
  useRejectTransfer,
} from '../hooks/useFundTransfers';
import type {
  CreateFundTransferPayload,
  FundBalanceDto,
  FundTransferDto,
  FundTransferStatus,
} from '../api/fundTransfer.api';

const CURRENCIES = [
  'VND', 'USD', 'EUR', 'AUD', 'JPY', 'GBP', 'SGD', 'THB', 'CNY', 'HKD', 'KRW',
  'CAD', 'CHF', 'NZD', 'TWD', 'MYR', 'IDR', 'PHP', 'LAK', 'KHR',
];

const STATUS: Record<FundTransferStatus, { color: string; label: string }> = {
  PENDING_APPROVAL: { color: 'gold', label: 'Chờ xác nhận' },
  CONFIRMED: { color: 'green', label: 'Đã nhận' },
  REJECTED: { color: 'red', label: 'Từ chối' },
  CANCELLED: { color: 'default', label: 'Đã hủy' },
};

const EMPTY_ITEM = { currencyCode: 'VND', amount: undefined };

export function FundTransferWorkspacePage() {
  const { message } = App.useApp();
  const [searchParams] = useSearchParams();
  const presetDestinationBranchId = searchParams.get('destinationBranchId');
  const isBranchCreationFlow = searchParams.get('origin') === 'branch-creation';
  const user = useAuthStore((state) => state.user);
  const isBranchUser = user?.role === 'branch';
  const canConfirm = user?.role === 'director' || user?.role === 'accountant';
  const { data: branches = [] } = useBranches();
  const sourceBranch = isBranchUser
    ? branches.find((branch) => branch.id === user?.branchId)
    : branches.find((branch) => branch.type === 'HEAD_OFFICE');
  const { data: sourceBalances = [] } = useFundBalances(sourceBranch?.id);
  const { data: transfers = [], isLoading } = useFundTransfers();
  const create = useCreateTransfer();
  const confirm = useConfirmTransfer();
  const reject = useRejectTransfer();
  const [form] = Form.useForm<CreateFundTransferPayload>();
  const watchedItems = Form.useWatch('items', form) ?? [];
  const selectedCurrencies = watchedItems
    .map((item) => item?.currencyCode)
    .filter(Boolean);

  useEffect(() => {
    if (
      presetDestinationBranchId
      && presetDestinationBranchId !== sourceBranch?.id
      && branches.some((branch) => branch.id === presetDestinationBranchId)
      && !form.getFieldValue('destinationBranchId')
    ) {
      form.setFieldValue('destinationBranchId', presetDestinationBranchId);
    }
  }, [branches, form, presetDestinationBranchId, sourceBranch?.id]);

  const branchName = (id: string) => {
    const branch = branches.find((item) => item.id === id);
    return branch ? `${branch.code} - ${branch.name}` : id.slice(0, 6);
  };

  const availableCurrencies = new Set(
    sourceBalances
      .filter((balance) => balance.accountType === 'CASH' || balance.accountType === 'FUND_A')
      .map((balance) => balance.currencyCode),
  );
  const currencyOptionsFor = (index: number) => CURRENCIES.map((currency) => ({
    value: currency,
    label: currency,
    disabled: (availableCurrencies.size > 0 && !availableCurrencies.has(currency))
      || (selectedCurrencies.includes(currency) && watchedItems[index]?.currencyCode !== currency),
  }));

  const balanceByCurrency = sourceBalances
    .filter((balance) => balance.accountType === 'CASH' || balance.accountType === 'FUND_A')
    .reduce<Record<string, number>>((result, balance) => ({
      ...result,
      [balance.currencyCode]: (result[balance.currencyCode] ?? 0) + balance.balance,
    }), {});

  const onCreate = async (values: CreateFundTransferPayload) => {
    const currencies = values.items.map((item) => item.currencyCode);
    if (new Set(currencies).size !== currencies.length) {
      message.error('Mỗi loại tiền chỉ được thêm một lần trong phiếu');
      return;
    }
    try {
      await create.mutateAsync(values);
      message.success('Đã tạo phiếu tiếp quỹ, chờ bên nhận xác nhận');
      form.resetFields();
    } catch (error: any) {
      message.error(error?.response?.data?.message ?? 'Tạo phiếu tiếp quỹ thất bại');
    }
  };

  const act = async (action: Promise<FundTransferDto>, successMessage: string) => {
    try {
      await action;
      message.success(successMessage);
    } catch (error: any) {
      message.error(error?.response?.data?.message ?? 'Thao tác thất bại');
    }
  };

  const balanceColumns: ColumnsType<FundBalanceDto> = [
    { title: 'Sổ quỹ', dataIndex: 'name' },
    { title: 'Loại tiền', dataIndex: 'currencyCode', width: 100 },
    {
      title: 'Số dư',
      dataIndex: 'balance',
      align: 'right',
      render: (value: number, record) => (
        <Typography.Text strong>{formatCurrency(value, record.currencyCode)}</Typography.Text>
      ),
    },
  ];

  const transferColumns: ColumnsType<FundTransferDto> = [
    { title: 'Mã phiếu', dataIndex: 'transferNo', width: 170 },
    { title: 'Người gửi', dataIndex: 'sourceBranchId', render: branchName, width: 190 },
    { title: 'Nơi nhận', dataIndex: 'destinationBranchId', render: branchName, width: 190 },
    {
      title: 'Các loại tiền',
      dataIndex: 'items',
      width: 240,
      render: (items: FundTransferDto['items']) => (
        <Space direction="vertical" size={2}>
          {items.map((item) => (
            <Typography.Text key={item.id}>
              <Tag>{item.currencyCode}</Tag>{formatCurrency(item.amount, item.currencyCode)}
            </Typography.Text>
          ))}
        </Space>
      ),
    },
    {
      title: 'Trạng thái',
      dataIndex: 'status',
      width: 130,
      render: (status: FundTransferStatus) => <Tag color={STATUS[status].color}>{STATUS[status].label}</Tag>,
    },
    {
      title: 'Ngày tạo',
      dataIndex: 'createdAt',
      width: 170,
      render: formatDateTime,
    },
    {
      title: 'Thao tác',
      key: 'actions',
      fixed: 'right',
      width: 180,
      render: (_, transfer) => transfer.status === 'PENDING_APPROVAL' && canConfirm ? (
        <Space>
          <Popconfirm
            title="Xác nhận đã nhận đủ tất cả loại tiền?"
            onConfirm={() => act(confirm.mutateAsync(transfer.id), 'Đã xác nhận tiếp quỹ')}
          >
            <Button type="primary" size="small">Xác nhận</Button>
          </Popconfirm>
          <Popconfirm
            title="Từ chối toàn bộ phiếu tiếp quỹ?"
            onConfirm={() => act(reject.mutateAsync(transfer.id), 'Đã từ chối phiếu')}
          >
            <Button danger size="small">Từ chối</Button>
          </Popconfirm>
        </Space>
      ) : <Typography.Text type="secondary">-</Typography.Text>,
    },
  ];

  return (
    <PageScaffold
      title="Tiếp Quỹ"
      description="Lập và theo dõi phiếu tiếp quỹ giữa Hội sở và các chi nhánh."
      moduleName="fund-transfer"
    >
      {isBranchCreationFlow && (
        <div className="mb-5 rounded-md border border-brand-100 bg-brand-50 px-5 py-4">
          <Steps
            size="small"
            current={1}
            items={[
              { title: 'Khởi tạo chi nhánh' },
              { title: 'Tiếp quỹ ban đầu' },
            ]}
          />
        </div>
      )}

      <div className="fund-transfer-context mb-5">
        <div className="fund-transfer-context__item">
            <Space align="start" size={12}>
              <span className="fund-transfer-context__icon"><UserOutlined /></span>
              <div>
                <div className="fund-transfer-context__label">Người lập phiếu</div>
                <div className="fund-transfer-context__value">{user?.name ?? '-'}</div>
              </div>
            </Space>
        </div>
        <div className="fund-transfer-context__item">
            <Space align="start" size={12}>
              <span className="fund-transfer-context__icon"><ShopOutlined /></span>
              <div>
                <div className="fund-transfer-context__label">Đơn vị gửi</div>
                <div className="fund-transfer-context__value">
                  {sourceBranch ? `${sourceBranch.code} - ${sourceBranch.name}` : 'Đang tải...'}
                </div>
              </div>
            </Space>
        </div>
        <div className="fund-transfer-context__item">
            <Space align="start" size={12}>
              <span className="fund-transfer-context__icon"><SafetyCertificateOutlined /></span>
              <div>
                <div className="fund-transfer-context__label">Phạm vi</div>
                <div className="fund-transfer-context__value">
                  {isBranchUser ? 'Chi nhánh đang làm việc' : 'Hội sở (HO)'}
                </div>
              </div>
            </Space>
        </div>
      </div>

      <Row gutter={[20, 20]} align="stretch">
        <Col xs={24} xl={12} className="flex">
          <Card
            title="Phiếu tiếp quỹ mới"
            extra={<Tag color="gold">{watchedItems.length} loại tiền</Tag>}
            className="fund-transfer-panel w-full"
          >
            <Form<CreateFundTransferPayload>
              form={form}
              layout="vertical"
              initialValues={{ items: [EMPTY_ITEM] }}
              onFinish={onCreate}
            >
              <Form.Item
                name="destinationBranchId"
                label="Đơn vị nhận"
                rules={[{ required: true, message: 'Chọn đơn vị nhận quỹ' }]}
              >
                <Select
                  size="large"
                  showSearch
                  optionFilterProp="label"
                  placeholder="Chọn đơn vị nhận"
                  options={branches
                    .filter((branch) => branch.id !== sourceBranch?.id)
                    .map((branch) => ({ value: branch.id, label: `${branch.code} - ${branch.name}` }))}
                />
              </Form.Item>

              <Form.List name="items">
                {(fields, { add, remove }) => (
                  <Space direction="vertical" size={12} className="w-full">
                    {fields.map((field, index) => (
                      <div key={field.key} className="fund-transfer-line w-full">
                        <div className="mb-3 flex items-center justify-between gap-3">
                          <Space size={10}>
                            <span className="flex h-7 w-7 items-center justify-center rounded-full bg-neutral-900 text-xs font-bold text-[#f5b301]">
                              {String(index + 1).padStart(2, '0')}
                            </span>
                            <Typography.Text strong>Khoản tiếp quỹ</Typography.Text>
                          </Space>
                          <Button
                            danger
                            type="text"
                            title="Xóa loại tiền"
                            icon={<DeleteOutlined />}
                            disabled={fields.length === 1}
                            onClick={() => remove(field.name)}
                          />
                        </div>
                        <Row gutter={[12, 12]} align="top">
                          <Col xs={24} sm={8}>
                            <Form.Item
                              {...field}
                              name={[field.name, 'currencyCode']}
                              label="Loại tiền"
                              className="mb-0"
                              rules={[{ required: true, message: 'Chọn loại tiền' }]}
                            >
                              <Select size="large" showSearch options={currencyOptionsFor(index)} />
                            </Form.Item>
                          </Col>
                          <Col xs={24} sm={16}>
                            <Form.Item
                              {...field}
                              name={[field.name, 'amount']}
                              label="Số tiền"
                              className="mb-0"
                              extra={watchedItems[index]?.currencyCode ? (
                                <>Số dư khả dụng: {formatCurrency(
                                  balanceByCurrency[watchedItems[index].currencyCode] ?? 0,
                                  watchedItems[index].currencyCode,
                                )}</>
                              ) : 'Chọn loại tiền để kiểm tra số dư'}
                              rules={[{ required: true, message: 'Nhập số tiền' }]}
                            >
                              <InputNumber
                                className="w-full"
                                size="large"
                                min={watchedItems[index]?.currencyCode === 'VND' ? 1 : 0.01}
                                precision={watchedItems[index]?.currencyCode === 'VND' ? 0 : 2}
                                controls={false}
                                formatter={numberInputFormatter}
                                parser={numberInputParser}
                                addonAfter={watchedItems[index]?.currencyCode ?? 'Tiền tệ'}
                              />
                            </Form.Item>
                          </Col>
                        </Row>
                      </div>
                    ))}
                    <Button
                      className="h-11!"
                      type="dashed"
                      icon={<PlusOutlined />}
                      onClick={() => add({ currencyCode: undefined, amount: undefined })}
                      disabled={fields.length >= CURRENCIES.length}
                      block
                    >
                      Thêm loại tiền
                    </Button>
                  </Space>
                )}
              </Form.List>

              <div className="mt-5 flex flex-col gap-3 border-t border-slate-200 pt-4 sm:flex-row sm:items-center sm:justify-between">
                <Typography.Text type="secondary">
                  {watchedItems.length} khoản tiền trong phiếu
                </Typography.Text>
                <Button
                  className="sm:min-w-52"
                  size="large"
                  type="primary"
                  htmlType="submit"
                  icon={<SendOutlined />}
                  loading={create.isPending}
                  disabled={!sourceBranch || watchedItems.length === 0}
                >
                  Tạo phiếu tiếp quỹ
                </Button>
              </div>
            </Form>
          </Card>
        </Col>

        <Col xs={24} xl={12} className="flex">
          <Card
            title="Số dư đơn vị gửi"
            extra={<Tag>{sourceBalances.length} sổ quỹ</Tag>}
            className="fund-transfer-panel w-full"
          >
            <Table<FundBalanceDto>
              rowKey="id"
              columns={balanceColumns}
              dataSource={sourceBalances.filter((balance) => balance.accountType === 'CASH' || balance.accountType === 'FUND_A')}
              pagination={false}
              locale={{ emptyText: 'Chưa có số dư quỹ' }}
              scroll={{ x: 480, y: 460 }}
            />
          </Card>
        </Col>

        <Col span={24}>
          <Card title="Danh sách phiếu tiếp quỹ">
            <Table<FundTransferDto>
              rowKey="id"
              loading={isLoading}
              columns={transferColumns}
              dataSource={transfers}
              scroll={{ x: 1260 }}
              locale={{ emptyText: 'Chưa có phiếu tiếp quỹ' }}
              pagination={{
                pageSize: 10,
                showSizeChanger: false,
                showTotal: (total) => `${total} phiếu`,
              }}
            />
          </Card>
        </Col>
      </Row>
    </PageScaffold>
  );
}
