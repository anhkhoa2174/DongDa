import {
  DeleteOutlined,
  PlusOutlined,
  SaveOutlined,
  SwapOutlined,
} from '@ant-design/icons';
import { App, Button, Card, Col, Form, Input, InputNumber, Row, Select, Space, Table, Tag, Typography } from 'antd';
import type { ColumnsType } from 'antd/es/table';
import { PageScaffold } from '@/shared/components/PageScaffold';
import { branchFundsMock } from '@/modules/fund-management/data/funds.mock';
import {
  formatForeignCurrency,
  formatVnd,
  numberInputFormatter,
  numberInputParser,
} from '@/shared/utils/formatters';
import {
  fundTransferCurrencyOptions,
  fundTransferReasonOptions,
  fundTransferSourceOptions,
} from '../data/fundTransfer.mock';
import type { FundTransferFormValues, FundTransferItem } from '../model/fundTransfer.types';

const defaultItem: FundTransferItem = {
  currency: 'VND',
  amount: 0,
  source: 'CENTRAL_CASH',
};

function formatTransferAmount(item: Partial<FundTransferItem>) {
  if (!item.currency || !item.amount) return '-';
  if (item.currency === 'VND') return formatVnd(Number(item.amount));
  return formatForeignCurrency(Number(item.amount), item.currency);
}

const summaryColumns: ColumnsType<Partial<FundTransferItem> & { key: number }> = [
  {
    title: 'Loại tiền',
    dataIndex: 'currency',
    render: (value: string) => <Tag color={value === 'VND' || value === 'USD' ? 'green' : 'blue'}>{value}</Tag>,
  },
  {
    title: 'Số lượng',
    key: 'amount',
    align: 'right',
    render: (_, record) => <Typography.Text strong>{formatTransferAmount(record)}</Typography.Text>,
  },
  {
    title: 'Nguồn',
    dataIndex: 'source',
    render: (value: string) => fundTransferSourceOptions.find((option) => option.value === value)?.label ?? '-',
  },
  { title: 'Ghi chú', dataIndex: 'note', ellipsis: true },
];

export function FundTransferPage() {
  const { message } = App.useApp();
  const [form] = Form.useForm<FundTransferFormValues>();
  const watchedItems = Form.useWatch('items', form) ?? [defaultItem];

  const submitFundTransfer = async (values: FundTransferFormValues) => {
    await message.success(`Đã tạo yêu cầu tiếp quỹ cho ${branchFundsMock.find((branch) => branch.key === values.branchId)?.branchName ?? 'chi nhánh'}`);
    form.resetFields();
  };

  return (
    <PageScaffold
      title="Tiếp Quỹ"
      description="Tạo yêu cầu tiếp quỹ linh hoạt theo chi nhánh, loại tiền và số lượng."
      moduleName="fund-transfer"
    >
      <Form<FundTransferFormValues>
        form={form}
        layout="vertical"
        initialValues={{
          branchId: branchFundsMock[0]?.key,
          reason: 'LOW_CASH',
          items: [defaultItem],
        }}
        onFinish={submitFundTransfer}
      >
        <Space direction="vertical" size={16} className="w-full">
          <Card title="Thông tin yêu cầu">
            <Row gutter={[16, 16]}>
              <Col xs={24} lg={8}>
                <Form.Item name="branchId" label="Chi nhánh nhận quỹ" rules={[{ required: true, message: 'Chọn chi nhánh nhận quỹ' }]}>
                  <Select
                    showSearch
                    placeholder="Chọn chi nhánh"
                    options={branchFundsMock.map((branch) => ({
                      value: branch.key,
                      label: `${branch.branchName} - ${branch.manager}`,
                    }))}
                  />
                </Form.Item>
              </Col>
              <Col xs={24} lg={8}>
                <Form.Item name="reason" label="Lý do tiếp quỹ" rules={[{ required: true, message: 'Chọn lý do tiếp quỹ' }]}>
                  <Select options={fundTransferReasonOptions} />
                </Form.Item>
              </Col>
              <Col xs={24} lg={8}>
                <Form.Item name="requestedBy" label="Người yêu cầu / ghi nhận">
                  <Input placeholder="VD: KTTH01" />
                </Form.Item>
              </Col>
            </Row>
          </Card>

          <Card
            title={<Space><SwapOutlined />Các loại tiền tiếp quỹ</Space>}
            extra={(
              <Form.List name="items">
                {(_, { add }) => (
                  <Button type="primary" ghost icon={<PlusOutlined />} onClick={() => add(defaultItem)}>
                    Thêm loại tiền
                  </Button>
                )}
              </Form.List>
            )}
          >
            <Form.List name="items">
              {(fields, { add, remove }) => (
                <Space direction="vertical" size={12} className="w-full">
                  {fields.map((field, index) => (
                    <Card
                      key={field.key}
                      size="small"
                      className="border-slate-200"
                      title={<Typography.Text strong>Thẻ tiếp quỹ #{index + 1}</Typography.Text>}
                      extra={(
                        <Button
                          danger
                          type="text"
                          icon={<DeleteOutlined />}
                          disabled={fields.length === 1}
                          onClick={() => remove(field.name)}
                        >
                          Xóa
                        </Button>
                      )}
                    >
                      <Row gutter={[12, 12]}>
                        <Col xs={24} md={7}>
                          <Form.Item
                            {...field}
                            name={[field.name, 'currency']}
                            label="Loại tiền"
                            rules={[{ required: true, message: 'Chọn loại tiền' }]}
                          >
                            <Select
                              showSearch
                              options={fundTransferCurrencyOptions.map((option) => ({
                                value: option.value,
                                label: option.label,
                              }))}
                            />
                          </Form.Item>
                        </Col>
                        <Col xs={24} md={6}>
                          <Form.Item
                            {...field}
                            name={[field.name, 'amount']}
                            label="Số lượng"
                            rules={[{ required: true, message: 'Nhập số lượng' }]}
                          >
                            <InputNumber
                              className="w-full"
                              min={0}
                              precision={2}
                              controls={false}
                              formatter={numberInputFormatter}
                              parser={numberInputParser}
                            />
                          </Form.Item>
                        </Col>
                        <Col xs={24} md={6}>
                          <Form.Item
                            {...field}
                            name={[field.name, 'source']}
                            label="Nguồn cấp"
                            rules={[{ required: true, message: 'Chọn nguồn cấp' }]}
                          >
                            <Select options={fundTransferSourceOptions} />
                          </Form.Item>
                        </Col>
                        <Col xs={24} md={5}>
                          <Form.Item {...field} name={[field.name, 'note']} label="Ghi chú">
                            <Input placeholder="Mệnh giá, túi tiền, lý do..." />
                          </Form.Item>
                        </Col>
                      </Row>
                    </Card>
                  ))}

                  <Button icon={<PlusOutlined />} onClick={() => add(defaultItem)} block>
                    Thêm thẻ tiếp quỹ
                  </Button>
                </Space>
              )}
            </Form.List>
          </Card>

          <Card title="Tóm tắt yêu cầu">
            <Table
              columns={summaryColumns}
              dataSource={watchedItems.map((item, index) => ({ ...item, key: index }))}
              pagination={false}
              size="middle"
            />
          </Card>

          <div className="flex justify-end gap-2">
            <Button onClick={() => form.resetFields()}>Nhập lại</Button>
            <Button type="primary" htmlType="submit" icon={<SaveOutlined />}>
              Tạo yêu cầu tiếp quỹ
            </Button>
          </div>
        </Space>
      </Form>
    </PageScaffold>
  );
}
