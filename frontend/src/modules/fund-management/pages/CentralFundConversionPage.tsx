import { ArrowLeftOutlined, DeleteOutlined, PlusOutlined, SwapOutlined } from '@ant-design/icons';
import { App, Alert, Button, Card, Col, Form, Input, InputNumber, Row, Select, Space, Typography } from 'antd';
import axios from 'axios';
import { useNavigate } from 'react-router-dom';
import { PageScaffold } from '@/shared/components/PageScaffold';
import {
  formatCurrency,
  formatVnd,
  numberInputFormatter,
  numberInputParser,
} from '@/shared/utils/formatters';
import { useCentralFundSummary, useConvertCentralFundA } from '../hooks/useCentralFund';

type ConversionItem = { currencyCode?: string; amount?: number };
type ConversionForm = { items: ConversionItem[]; note?: string };

const EMPTY_ITEM: ConversionItem = { currencyCode: undefined, amount: undefined };

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
    const fund = availableFunds.find((candidate) => candidate.currency === item?.currencyCode);
    return sum + Math.round(Number(item?.amount ?? 0) * (fund?.buyRate ?? 0));
  }, 0);

  const submit = async (values: ConversionForm) => {
    try {
      const result = await convert.mutateAsync({
        items: values.items.map((item) => ({
          currencyCode: item.currencyCode!,
          amount: Number(item.amount),
        })),
        note: values.note?.trim() || undefined,
      });
      message.success(`Đã quy đổi ${result.items.length} loại ngoại tệ thành ${formatVnd(result.totalVndAmount)}`);
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
          <Card title={<Space><SwapOutlined />Phiếu quy đổi ngoại tệ tại Hội sở</Space>} loading={isLoading}>
            <Alert
              type="info"
              showIcon
              className="mb-5"
              message="Nghiệp vụ không yêu cầu mở ca"
              description="Toàn bộ ngoại tệ trong phiếu được kiểm tra và ghi sổ đồng thời; một khoản lỗi sẽ hủy toàn bộ phiếu."
            />
            <Form form={form} layout="vertical" initialValues={{ items: [EMPTY_ITEM] }} onFinish={submit}>
              <Form.List name="items">
                {(fields, { add, remove }) => (
                  <Space direction="vertical" size={12} className="w-full">
                    {fields.map((field, index) => {
                      const fund = itemFund(index);
                      const amount = Number(watchedItems[index]?.amount ?? 0);
                      const estimatedVnd = Math.round(amount * (fund?.buyRate ?? 0));
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
                            <Col xs={24} md={8}>
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
                                  onChange={() => form.setFieldValue(['items', field.name, 'amount'], undefined)}
                                />
                              </Form.Item>
                            </Col>
                            <Col xs={24} md={8}>
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
                            <Col xs={24} md={8}>
                              <div className="fund-conversion-line-result">
                                <span>Tỷ giá FX mua</span>
                                <strong>{fund ? formatVnd(fund.buyRate) : '---'}</strong>
                                <small>Thu về {formatVnd(estimatedVnd)}</small>
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
