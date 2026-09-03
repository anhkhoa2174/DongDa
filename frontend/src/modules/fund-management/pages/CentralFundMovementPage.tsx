import {
  ArrowLeftOutlined,
  BankOutlined,
  DeleteOutlined,
  MoneyCollectOutlined,
  PlusOutlined,
  SendOutlined,
} from '@ant-design/icons';
import {
  Alert,
  App,
  Button,
  Card,
  Col,
  Form,
  Input,
  InputNumber,
  Row,
  Segmented,
  Select,
  Space,
  Tag,
  Typography,
} from 'antd';
import { useNavigate } from 'react-router-dom';
import { PageScaffold } from '@/shared/components/PageScaffold';
import { currencyCodes } from '@/shared/constants/currencies';
import { getApiErrorMessage } from '@/shared/utils/errors';
import { useBankAccounts } from '@/modules/bank-management/hooks/useBank';
import { useAuthStore } from '@/modules/auth/model/auth.store';
import { useFundBalances } from '@/modules/fund-transfer/hooks/useFundTransfers';
import {
  formatCurrency,
  formatBankAccountLabel,
  numberInputFormatter,
  numberInputParser,
} from '@/shared/utils/formatters';
import type { CreateCentralFundMovementPayload } from '../api/centralFund.api';
import {
  useCentralFundSummary, useCreateBranchFundMovement, useCreateCentralFundMovement,
} from '../hooks/useCentralFund';

const CURRENCIES = currencyCodes;

const EMPTY_ITEM = { currencyCode: 'VND', amount: undefined, bankAccountId: undefined };

type Props = {
  direction: 'IN' | 'OUT';
  scope?: 'central' | 'branch';
};

export function CentralFundMovementPage({ direction, scope = 'central' }: Props) {
  const { message } = App.useApp();
  const navigate = useNavigate();
  const user = useAuthStore((state) => state.user);
  const [form] = Form.useForm<CreateCentralFundMovementPayload>();
  const createCentralMovement = useCreateCentralFundMovement();
  const createBranchMovement = useCreateBranchFundMovement();
  const isBranchScope = scope === 'branch';
  const createMovement = isBranchScope ? createBranchMovement : createCentralMovement;
  const { data: summary } = useCentralFundSummary(!isBranchScope);
  const { data: branchBalances = [] } = useFundBalances(isBranchScope ? user?.branchId : undefined);
  const { data: bankAccounts = [], isLoading: isLoadingBanks } = useBankAccounts(undefined, !isBranchScope);
  const sourceType = Form.useWatch('sourceType', form) ?? 'CASH';
  const watchedItems = Form.useWatch('items', form) ?? [];
  const isReceipt = direction === 'IN';

  const cashBalanceByCurrency: Record<string, number> = {
    ...(isBranchScope
      ? branchBalances.reduce<Record<string, number>>((result, item) => ({
          ...result,
          [item.currencyCode]: (result[item.currencyCode] ?? 0) + item.balance,
        }), {})
      : {
          VND: summary?.vndCash ?? 0,
          USD: summary?.usdCash ?? 0,
          ...(summary?.fundA ?? []).reduce<Record<string, number>>((result, item) => ({
            ...result,
            [item.currency]: item.amount,
          }), {}),
        }),
  };

  const selectedKeys = watchedItems.map((item) => (
    sourceType === 'BANK' ? item?.bankAccountId : item?.currencyCode
  )).filter(Boolean);

  const currencyOptionsFor = (index: number) => CURRENCIES.map((currency) => ({
    value: currency,
    label: currency,
    disabled: sourceType === 'CASH'
      && selectedKeys.includes(currency)
      && watchedItems[index]?.currencyCode !== currency,
  }));

  const bankOptionsFor = (index: number) => bankAccounts
    .filter((account) => !isBranchScope || account.branchId === user?.branchId)
    .filter((account) => account.currencyCode === watchedItems[index]?.currencyCode)
    .map((account) => ({
      value: account.id,
      label: formatBankAccountLabel(account),
      disabled: selectedKeys.includes(account.id) && watchedItems[index]?.bankAccountId !== account.id,
    }));

  const availableBalance = (index: number) => {
    const item = watchedItems[index];
    if (!item?.currencyCode) return null;
    if (sourceType === 'CASH') return cashBalanceByCurrency[item.currencyCode] ?? 0;
    return bankAccounts.find((account) => account.id === item.bankAccountId)?.currentBalance ?? null;
  };

  const changeSource = (value: string | number) => {
    form.setFieldsValue({
      sourceType: value as 'CASH' | 'BANK',
      items: [{ ...EMPTY_ITEM }],
    });
  };

  const submit = async (values: CreateCentralFundMovementPayload) => {
    const keys = values.items.map((item) => values.sourceType === 'BANK' ? item.bankAccountId : item.currencyCode);
    if (new Set(keys).size !== keys.length) {
      message.error(values.sourceType === 'BANK'
        ? 'Mỗi tài khoản ngân hàng chỉ được thêm một lần trong phiếu'
        : 'Mỗi loại tiền chỉ được thêm một lần trong phiếu');
      return;
    }

    try {
      await createMovement.mutateAsync({
        ...values,
        direction,
        sourceType: isBranchScope ? 'CASH' : values.sourceType,
      });
      const fundName = isBranchScope ? 'Quỹ Chi Nhánh' : 'Quỹ Chung';
      message.success(isReceipt ? `Đã ghi nhận phiếu thu ${fundName}` : `Đã ghi nhận phiếu chi ${fundName}`);
      navigate(isBranchScope ? '/fund-management/branch-funds' : '/fund-management/central-fund');
    } catch (error: unknown) {
      message.error(getApiErrorMessage(error, `Không thể tạo phiếu ${isReceipt ? 'thu' : 'chi'}`));
    }
  };

  return (
    <PageScaffold
      title={`${isReceipt ? 'Phiếu Thu' : 'Phiếu Chi'} ${isBranchScope ? 'Quỹ Chi Nhánh' : 'Quỹ Chung'}`}
      description={isBranchScope
        ? `Ghi nhận một hoặc nhiều khoản tiền ${isReceipt ? 'thu vào' : 'chi ra'} từ tiền mặt của chi nhánh.`
        : `Ghi nhận một hoặc nhiều khoản tiền ${isReceipt ? 'thu vào' : 'chi ra'} từ tiền mặt hoặc tài khoản ngân hàng.`}
      moduleName="fund-management"
      extra={(
        <Button icon={<ArrowLeftOutlined />} onClick={() => navigate(isBranchScope ? '/fund-management/branch-funds' : '/fund-management/central-fund')}>
          Quay lại {isBranchScope ? 'Quỹ Chi Nhánh' : 'Quỹ Chung'}
        </Button>
      )}
    >
      <Row justify="center">
        <Col xs={24} xl={18} xxl={15}>
          <Card
            title={isReceipt ? 'Thông tin phiếu thu' : 'Thông tin phiếu chi'}
            extra={<Tag color={isReceipt ? 'green' : 'red'}>{watchedItems.length} khoản tiền</Tag>}
            className="fund-transfer-panel"
          >
            <Form<CreateCentralFundMovementPayload>
              form={form}
              layout="vertical"
              initialValues={{ direction, sourceType: 'CASH', items: [{ ...EMPTY_ITEM }] }}
              onFinish={submit}
            >
              {isBranchScope ? (
                <>
                  <Form.Item name="sourceType" hidden><Input /></Form.Item>
                  <div className="mb-5 rounded border border-brand-200 bg-brand-50 px-4 py-3">
                    <Space>
                      <MoneyCollectOutlined />
                      <div>
                        <Typography.Text strong>Nguồn: Tiền mặt Quỹ Chi Nhánh</Typography.Text>
                        <Typography.Text type="secondary" className="block text-xs!">Không sử dụng tài khoản ngân hàng tại Quỹ Chi nhánh.</Typography.Text>
                      </div>
                    </Space>
                  </div>
                </>
              ) : (
                <Form.Item name="sourceType" label="Nguồn" rules={[{ required: true }]}>
                  <Segmented
                    block
                    size="large"
                    onChange={changeSource}
                    options={[
                      { value: 'CASH', label: 'Tiền mặt', icon: <MoneyCollectOutlined /> },
                      { value: 'BANK', label: 'Ngân hàng', icon: <BankOutlined /> },
                    ]}
                  />
                </Form.Item>
              )}

              <Form.List name="items">
                {(fields, { add, remove }) => (
                  <Space direction="vertical" size={12} className="w-full">
                    {fields.map((field, index) => {
                      const currency = watchedItems[index]?.currencyCode;
                      const balance = availableBalance(index);
                      return (
                        <div key={field.key} className="fund-transfer-line w-full">
                          <div className="mb-3 flex items-center justify-between gap-3">
                            <Space size={10}>
                              <span className="flex h-7 w-7 items-center justify-center rounded-full bg-neutral-900 text-xs font-bold text-[#f5b301]">
                                {String(index + 1).padStart(2, '0')}
                              </span>
                              <Typography.Text strong>{isReceipt ? 'Khoản thu' : 'Khoản chi'}</Typography.Text>
                            </Space>
                            <Button
                              danger
                              type="text"
                              title="Xóa khoản tiền"
                              icon={<DeleteOutlined />}
                              disabled={fields.length === 1}
                              onClick={() => remove(field.name)}
                            />
                          </div>

                          <Row gutter={[12, 12]} align="top">
                            <Col xs={24} md={sourceType === 'BANK' ? 6 : 8}>
                              <Form.Item
                                {...field}
                                name={[field.name, 'currencyCode']}
                                label="Loại tiền"
                                className="mb-0"
                                rules={[{ required: true, message: 'Chọn loại tiền' }]}
                              >
                                <Select
                                  size="large"
                                  showSearch
                                  options={currencyOptionsFor(index)}
                                  onChange={() => form.setFieldValue(['items', field.name, 'bankAccountId'], undefined)}
                                />
                              </Form.Item>
                            </Col>

                            {sourceType === 'BANK' && (
                              <Col xs={24} md={10}>
                                <Form.Item
                                  {...field}
                                  name={[field.name, 'bankAccountId']}
                                  label="Tài khoản ngân hàng"
                                  className="mb-0"
                                  rules={[{ required: true, message: 'Chọn tài khoản ngân hàng' }]}
                                >
                                  <Select
                                    size="large"
                                    showSearch
                                    optionFilterProp="label"
                                    loading={isLoadingBanks}
                                    placeholder={currency ? `Chọn tài khoản ${currency}` : 'Chọn loại tiền trước'}
                                    disabled={!currency}
                                    options={bankOptionsFor(index)}
                                  />
                                </Form.Item>
                              </Col>
                            )}

                            <Col xs={24} md={sourceType === 'BANK' ? 8 : 16}>
                              <Form.Item
                                {...field}
                                name={[field.name, 'amount']}
                                label="Số tiền"
                                className="mb-0"
                                extra={!isReceipt && currency
                                  ? `Số dư khả dụng: ${balance === null ? 'Chọn tài khoản' : formatCurrency(balance, currency)}`
                                  : undefined}
                                rules={[{ required: true, message: 'Nhập số tiền' }]}
                              >
                                <InputNumber
                                  className="w-full"
                                  size="large"
                                  min={currency === 'VND' ? 1 : 0.01}
                                  precision={currency === 'VND' ? 0 : 2}
                                  controls={false}
                                  formatter={numberInputFormatter}
                                  parser={numberInputParser}
                                  addonAfter={currency ?? 'Tiền tệ'}
                                />
                              </Form.Item>
                            </Col>
                          </Row>
                        </div>
                      );
                    })}

                    <Button
                      className="h-11!"
                      type="dashed"
                      icon={<PlusOutlined />}
                      onClick={() => add({ currencyCode: undefined, amount: undefined, bankAccountId: undefined })}
                      disabled={fields.length >= 20}
                      block
                    >
                      Thêm loại tiền
                    </Button>
                  </Space>
                )}
              </Form.List>

              <Form.Item
                name="note"
                label="Ghi chú"
                className="mt-5"
                rules={[{ max: 1000, message: 'Ghi chú tối đa 1.000 ký tự' }]}
              >
                <Input.TextArea rows={3} showCount maxLength={1000} placeholder="Nội dung và thông tin bổ sung của phiếu" />
              </Form.Item>

              {!isReceipt && (
                <Alert
                  type="warning"
                  showIcon
                  message="Hệ thống sẽ kiểm tra số dư từng nguồn trước khi ghi nhận phiếu chi."
                  className="mb-4"
                />
              )}

              <div className="flex flex-col gap-3 border-t border-slate-200 pt-4 sm:flex-row sm:items-center sm:justify-between">
                <Typography.Text type="secondary">{watchedItems.length} khoản tiền trong phiếu</Typography.Text>
                <Button
                  className="sm:min-w-52"
                  size="large"
                  type="primary"
                  danger={!isReceipt}
                  htmlType="submit"
                  icon={<SendOutlined />}
                  loading={createMovement.isPending}
                >
                  {isReceipt ? 'Xác nhận phiếu thu' : 'Xác nhận phiếu chi'}
                </Button>
              </div>
            </Form>
          </Card>
        </Col>
      </Row>
    </PageScaffold>
  );
}
