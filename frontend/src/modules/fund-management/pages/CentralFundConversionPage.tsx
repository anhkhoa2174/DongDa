import { ArrowLeftOutlined, DeleteOutlined, PlusOutlined, SwapOutlined } from '@ant-design/icons';
import { App, Alert, Button, Card, Col, Form, Input, InputNumber, Row, Select, Space, Typography } from 'antd';
import axios from 'axios';
import { useNavigate } from 'react-router-dom';
import { PageScaffold } from '@/shared/components/PageScaffold';
import {
  exchangeRateInputFormatter,
  exchangeRateInputParser,
  formatCurrency,
  formatExchangeRate,
  formatVnd,
  numberInputFormatter,
  numberInputParser,
} from '@/shared/utils/formatters';
import { useCentralFundSummary, useConvertCentralFundA } from '../hooks/useCentralFund';

type ConversionItem = { currencyCode?: string; amount?: number; rate?: number; deduction?: number };
type ConversionForm = { items: ConversionItem[]; note?: string };

const EMPTY_ITEM: ConversionItem = {
  currencyCode: undefined,
  amount: undefined,
  rate: undefined,
  deduction: 0,
};

function errorMessage(error: unknown) {
  if (axios.isAxiosError(error)) {
    const message = error.response?.data?.message;
    return Array.isArray(message) ? message.join(', ') : message || 'Không thể quy đổi Quỹ A';
  }
  return 'Không thể quy đổi Quỹ A';
}

export function CentralFundConversionPage() {
  const navigate = useNavigate();
  const { message } = App.useApp();
  const [form] = Form.useForm<ConversionForm>();
  const { data: summary, isLoading } = useCentralFundSummary();
  const convert = useConvertCentralFundA();
  const watchedItems = Form.useWatch('items', form) ?? [];
  const availableFunds = (summary?.fundA ?? []).filter((item) => item.amount > 0);
  const selectedCurrencies = watchedItems.map((item) => item?.currencyCode).filter(Boolean);

  const currencyOptionsFor = (index: number) => availableFunds
    .filter((fund) => fund.currency === watchedItems[index]?.currencyCode || !selectedCurrencies.includes(fund.currency))
    .map((fund) => ({
      value: fund.currency,
      label: `${fund.currency} - Tồn ${formatCurrency(fund.amount, fund.currency)}`,
    }));

  const itemFund = (index: number) => availableFunds.find(
    (fund) => fund.currency === watchedItems[index]?.currencyCode,
  );
  const estimatedTotalVnd = watchedItems.reduce((sum, item) => {
    const grossVnd = Math.round(Number(item?.amount ?? 0) * Number(item?.rate ?? 0));
    return sum + Math.max(0, grossVnd - Math.round(Number(item?.deduction ?? 0)));
  }, 0);

  const submit = async (values: ConversionForm) => {
    try {
      const result = await convert.mutateAsync({
        items: values.items.map((item) => ({
          currencyCode: item.currencyCode!,
          amount: Number(item.amount),
          rate: Number(item.rate),
          deduction: Number(item.deduction ?? 0),
        })),
        note: values.note?.trim() || undefined,
      });
      message.success(`Đã bán ${result.items.length} loại ngoại tệ, thực thu ${formatVnd(result.totalVndAmount)}`);
      form.resetFields();
    } catch (error) {
      message.error(errorMessage(error));
    }
  };

  return (
    <PageScaffold
      title="Bán ngoại tệ Quỹ A"
      description="Giảm tồn nhiều loại ngoại tệ tại Hội sở và ghi tăng tiền mặt VND trong cùng một phiếu."
      moduleName="fund-management"
      extra={(
        <Button icon={<ArrowLeftOutlined />} onClick={() => navigate('/fund-management/central-fund')}>
          Quay lại Quỹ Chung
        </Button>
      )}
    >
      <Row justify="center">
        <Col xs={24} xl={18}>
          <Card title={<Space><SwapOutlined />Phiếu bán ngoại tệ tại Hội sở</Space>} loading={isLoading}>
            <Alert
              type="info"
              showIcon
              className="mb-5"
              message="Nghiệp vụ không yêu cầu mở ca"
              description="Nhập tỷ giá và khấu trừ riêng cho từng ngoại tệ. Hệ thống không dùng tỷ giá ACTIVE; toàn bộ phiếu được kiểm tra và ghi sổ đồng thời."
            />
            <Form form={form} layout="vertical" initialValues={{ items: [EMPTY_ITEM] }} onFinish={submit}>
              <Form.List name="items">
                {(fields, { add, remove }) => (
                  <Space direction="vertical" size={12} className="w-full">
                    {fields.map((field, index) => {
                      const fund = itemFund(index);
                      const amount = Number(watchedItems[index]?.amount ?? 0);
                      const rate = Number(watchedItems[index]?.rate ?? 0);
                      const deduction = Math.round(Number(watchedItems[index]?.deduction ?? 0));
                      const grossVnd = Math.round(amount * rate);
                      const estimatedVnd = Math.max(0, grossVnd - deduction);
                      return (
                        <div key={field.key} className="fund-transfer-line w-full">
                          <div className="mb-3 flex items-center justify-between gap-3">
                            <Space size={10}>
                              <span className="flex h-7 w-7 items-center justify-center rounded-full bg-neutral-900 text-xs font-bold text-[#f5b301]">
                                {String(index + 1).padStart(2, '0')}
                              </span>
                              <Typography.Text strong>Khoản ngoại tệ bán</Typography.Text>
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
                            <Col xs={24} md={12} xl={5}>
                              <Form.Item
                                {...field}
                                name={[field.name, 'currencyCode']}
                                label="Ngoại tệ Quỹ A"
                                className="mb-0"
                                rules={[{ required: true, message: 'Chọn loại ngoại tệ' }]}
                              >
                                <Select
                                  size="large"
                                  showSearch
                                  placeholder="Chọn loại tiền"
                                  options={currencyOptionsFor(index)}
                                  onChange={() => {
                                    form.setFieldValue(['items', field.name, 'amount'], undefined);
                                    form.setFieldValue(['items', field.name, 'rate'], undefined);
                                    form.setFieldValue(['items', field.name, 'deduction'], 0);
                                  }}
                                />
                              </Form.Item>
                            </Col>
                            <Col xs={24} md={12} xl={5}>
                              <Form.Item
                                {...field}
                                name={[field.name, 'amount']}
                                label="Số lượng bán"
                                className="mb-0"
                                extra={fund ? `Tồn khả dụng: ${formatCurrency(fund.amount, fund.currency)}` : 'Chọn ngoại tệ để kiểm tra tồn'}
                                rules={[
                                  { required: true, message: 'Nhập số lượng' },
                                  {
                                    validator: (_, value) => Number(value) > 0 && Number(value) <= (fund?.amount ?? 0)
                                      ? Promise.resolve()
                                      : Promise.reject(new Error(`Không được vượt tồn ${fund?.amount ?? 0}`)),
                                  },
                                ]}
                              >
                                <InputNumber
                                  className="w-full"
                                  size="large"
                                  min={0.01}
                                  max={fund?.amount}
                                  precision={2}
                                  controls={false}
                                  addonAfter={fund?.currency ?? 'Ngoại tệ'}
                                  formatter={numberInputFormatter}
                                  parser={numberInputParser}
                                />
                              </Form.Item>
                            </Col>
                            <Col xs={24} md={8} xl={5}>
                              <Form.Item
                                {...field}
                                name={[field.name, 'rate']}
                                label="Tỷ giá"
                                className="mb-0"
                                rules={[
                                  { required: true, message: 'Nhập tỷ giá bán' },
                                  { type: 'number', min: 0.000001, message: 'Tỷ giá phải lớn hơn 0' },
                                ]}
                              >
                                <InputNumber
                                  className="w-full"
                                  size="large"
                                  min={0.000001}
                                  precision={6}
                                  controls={false}
                                  addonAfter={`VND/${fund?.currency ?? 'NT'}`}
                                  formatter={exchangeRateInputFormatter}
                                  parser={exchangeRateInputParser}
                                />
                              </Form.Item>
                            </Col>
                            <Col xs={24} md={8} xl={4}>
                              <Form.Item
                                {...field}
                                name={[field.name, 'deduction']}
                                label="Khấu trừ"
                                className="mb-0"
                                dependencies={[
                                  ['items', field.name, 'amount'],
                                  ['items', field.name, 'rate'],
                                ]}
                                rules={[
                                  { required: true, message: 'Nhập khấu trừ, có thể bằng 0' },
                                  {
                                    validator: (_, value) => {
                                      const deductionValue = Number(value ?? 0);
                                      if (deductionValue < 0) return Promise.reject(new Error('Khấu trừ không được âm'));
                                      if (grossVnd > 0 && deductionValue >= grossVnd) {
                                        return Promise.reject(new Error('Phải nhỏ hơn giá trị gộp'));
                                      }
                                      return Promise.resolve();
                                    },
                                  },
                                ]}
                              >
                                <InputNumber
                                  className="w-full"
                                  size="large"
                                  min={0}
                                  precision={0}
                                  controls={false}
                                  addonAfter="VND"
                                  formatter={numberInputFormatter}
                                  parser={numberInputParser}
                                />
                              </Form.Item>
                            </Col>
                            <Col xs={24} md={8} xl={5}>
                              <div className="fund-conversion-line-result">
                                <span>Thành tiền VND</span>
                                <strong>{formatVnd(estimatedVnd)}</strong>
                                <small>
                                  {formatCurrency(amount, fund?.currency ?? 'NT')} × {formatExchangeRate(rate, 6)} − {formatVnd(deduction)}
                                </small>
                              </div>
                            </Col>
                          </Row>
                        </div>
                      );
                    })}
                    <Button
                      className="h-11!"
                      type="dashed"
                      icon={<PlusOutlined />}
                      onClick={() => add({ ...EMPTY_ITEM })}
                      disabled={fields.length >= availableFunds.length}
                      block
                    >
                      Thêm loại tiền
                    </Button>
                  </Space>
                )}
              </Form.List>

              <div className="fund-conversion-total">
                <span>{watchedItems.length} khoản ngoại tệ trong phiếu</span>
                <div><small>Tổng VND dự kiến thu về</small><strong>{formatVnd(estimatedTotalVnd)}</strong></div>
              </div>
              <Form.Item name="note" label="Ghi chú" className="mt-5">
                <Input.TextArea rows={3} maxLength={1000} showCount placeholder="Đối tác hoặc nội dung giao dịch" />
              </Form.Item>
              <Button type="primary" htmlType="submit" icon={<SwapOutlined />} loading={convert.isPending} size="large" block>
                Xác nhận bán {watchedItems.length} loại ngoại tệ
              </Button>
            </Form>
          </Card>
        </Col>
      </Row>
    </PageScaffold>
  );
}
