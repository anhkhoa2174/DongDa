import { ArrowLeftOutlined, DeleteOutlined, PlusOutlined, SwapOutlined } from '@ant-design/icons';
import { App, Button, Card, Col, Form, Input, InputNumber, Row, Select, Space, Tabs, Typography } from 'antd';
import axios from 'axios';
import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { PageScaffold } from '@/shared/components/PageScaffold';
import { CURRENCIES, getCurrencyMetadata } from '@/shared/constants/currencies';
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
type ConversionDirection = 'BUY' | 'SELL';

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
  const [direction, setDirection] = useState<ConversionDirection>('SELL');
  const { data: summary, isLoading } = useCentralFundSummary();
  const convert = useConvertCentralFundA();
  const watchedItems = Form.useWatch('items', form) ?? [];
  const fundBalances = summary?.fundA ?? [];
  const availableFunds = fundBalances.filter((item) => item.amount > 0);
  const selectableCurrencies = direction === 'SELL'
    ? availableFunds.map((fund) => fund.currency)
    : CURRENCIES.filter((currency) => currency.code !== 'VND' && currency.code !== 'USD')
      .map((currency) => currency.code);
  const selectedCurrencies = watchedItems.map((item) => item?.currencyCode).filter(Boolean);

  const currencyOptionsFor = (index: number) => selectableCurrencies
    .filter((currency) => currency === watchedItems[index]?.currencyCode || !selectedCurrencies.includes(currency))
    .map((currency) => {
      const fund = fundBalances.find((item) => item.currency === currency);
      const metadata = getCurrencyMetadata(currency);
      return {
        value: currency,
        label: direction === 'SELL'
          ? `${currency} - Tồn ${formatCurrency(fund?.amount ?? 0, currency)}`
          : `${currency} - ${metadata.name}${fund ? ` - Tồn ${formatCurrency(fund.amount, currency)}` : ''}`,
      };
    });

  const itemFund = (index: number) => fundBalances.find(
    (fund) => fund.currency === watchedItems[index]?.currencyCode,
  );
  const estimatedTotalVnd = watchedItems.reduce((sum, item) => {
    const grossVnd = Math.round(Number(item?.amount ?? 0) * Number(item?.rate ?? 0));
    return sum + Math.max(0, grossVnd - Math.round(Number(item?.deduction ?? 0)));
  }, 0);

  const submit = async (values: ConversionForm) => {
    try {
      const result = await convert.mutateAsync({
        direction,
        items: values.items.map((item) => ({
          currencyCode: item.currencyCode!,
          amount: Number(item.amount),
          rate: Number(item.rate),
          deduction: Number(item.deduction ?? 0),
        })),
        note: values.note?.trim() || undefined,
      });
      message.success(
        `Đã ${direction === 'BUY' ? 'mua' : 'bán'} ${result.items.length} loại ngoại tệ, `
        + `${direction === 'BUY' ? 'thực chi' : 'thực thu'} ${formatVnd(result.totalVndAmount)}`,
      );
      form.resetFields();
    } catch (error) {
      message.error(errorMessage(error));
    }
  };

  return (
    <PageScaffold
      title="Mua/Bán ngoại tệ Quỹ A"
      description="Giao dịch nhiều loại ngoại tệ tại Hội sở bằng tỷ giá và mức khấu trừ nhập trực tiếp."
      moduleName="fund-management"
      extra={(
        <Button icon={<ArrowLeftOutlined />} onClick={() => navigate('/fund-management/central-fund')}>
          Quay lại Quỹ Chung
        </Button>
      )}
    >
      <Row justify="center">
        <Col xs={24}>
          <Card title={<Space><SwapOutlined />Phiếu giao dịch ngoại tệ tại Hội sở</Space>} loading={isLoading}>
            <Tabs
              className="fund-conversion-tabs"
              size="large"
              activeKey={direction}
              onChange={(key) => {
                setDirection(key as ConversionDirection);
                form.resetFields();
              }}
              items={[
                { key: 'SELL', label: 'Bán ngoại tệ Quỹ A' },
                { key: 'BUY', label: 'Mua ngoại tệ Quỹ A' },
              ]}
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
                              <Typography.Text strong>Khoản ngoại tệ {direction === 'BUY' ? 'mua' : 'bán'}</Typography.Text>
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
                                label={direction === 'BUY' ? 'Ngoại tệ cần mua' : 'Ngoại tệ Quỹ A'}
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
                                label={`Số lượng ${direction === 'BUY' ? 'mua' : 'bán'}`}
                                className="mb-0"
                                extra={direction === 'BUY'
                                  ? `Cho phép số lẻ, tối đa 2 chữ số${fund ? ` · Đang tồn ${formatCurrency(fund.amount, fund.currency)}` : ''}`
                                  : (fund ? `Tồn khả dụng: ${formatCurrency(fund.amount, fund.currency)}` : 'Chọn ngoại tệ để kiểm tra tồn')}
                                rules={[
                                  { required: true, message: 'Nhập số lượng' },
                                  ...(direction === 'SELL' ? [{
                                    validator: (_rule: unknown, value: number | undefined) => Number(value) > 0 && Number(value) <= (fund?.amount ?? 0)
                                      ? Promise.resolve()
                                      : Promise.reject(new Error(`Không được vượt tồn ${fund?.amount ?? 0}`)),
                                  }] : []),
                                ]}
                              >
                                <InputNumber
                                  className="w-full"
                                  size="large"
                                  min={0.01}
                                  max={direction === 'SELL' ? fund?.amount : undefined}
                                  precision={2}
                                  controls={false}
                                  addonAfter={watchedItems[index]?.currencyCode ?? 'Ngoại tệ'}
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
                                  { required: true, message: `Nhập tỷ giá ${direction === 'BUY' ? 'mua' : 'bán'}` },
                                  { type: 'number', min: 0.000001, message: 'Tỷ giá phải lớn hơn 0' },
                                ]}
                              >
                                <InputNumber
                                  className="w-full"
                                  size="large"
                                  min={0.000001}
                                  precision={6}
                                  controls={false}
                                  addonAfter={`VND/${watchedItems[index]?.currencyCode ?? 'NT'}`}
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
                      disabled={fields.length >= Math.min(selectableCurrencies.length, 18)}
                      block
                    >
                      Thêm loại tiền
                    </Button>
                  </Space>
                )}
              </Form.List>

              <div className="fund-conversion-total">
                <span>{watchedItems.length} khoản ngoại tệ trong phiếu</span>
                <div>
                  <small>{direction === 'BUY' ? 'Tổng tiền mặt VND dự kiến chi' : 'Tổng VND dự kiến thu về'}</small>
                  <strong>{formatVnd(estimatedTotalVnd)}</strong>
                </div>
              </div>
              <Form.Item name="note" label="Ghi chú" className="mt-5">
                <Input.TextArea rows={3} maxLength={1000} showCount placeholder="Đối tác hoặc nội dung giao dịch" />
              </Form.Item>
              <Button type="primary" htmlType="submit" icon={<SwapOutlined />} loading={convert.isPending} size="large" block>
                Xác nhận {direction === 'BUY' ? 'mua' : 'bán'} {watchedItems.length} loại ngoại tệ
              </Button>
            </Form>
          </Card>
        </Col>
      </Row>
    </PageScaffold>
  );
}
