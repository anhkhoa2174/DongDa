import {
  CheckCircleOutlined,
  EditOutlined,
  HistoryOutlined,
  SaveOutlined,
  SendOutlined,
  SwapOutlined,
  UploadOutlined,
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
  Modal,
  Row,
  Space,
  Table,
  Tag,
  Typography,
  Upload,
} from 'antd';
import type { ColumnsType } from 'antd/es/table';
import type { UploadFile } from 'antd';
import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { PageScaffold } from '@/shared/components/PageScaffold';
import { RateCard } from '@/modules/dashboard/components/RateCard';
import { useAuthStore } from '@/modules/auth/model/auth.store';
import { hasPermission } from '@/modules/auth/model/permissions';
import { fundARatesMock, primaryRatesMock } from '../data/exchangeRates.mock';
import type { FundARate, FundARateForm, PrimaryRateForm } from '../model/exchangeRate.types';

const baseFundAColumns: ColumnsType<FundARate> = [
  {
    title: 'Ngoại tệ',
    dataIndex: 'currency',
    fixed: 'left',
    render: (value: string, record) => (
      <Space direction="vertical" size={0}>
        <Typography.Text strong>{value}</Typography.Text>
        <Typography.Text type="secondary">{record.name}</Typography.Text>
      </Space>
    ),
  },
  {
    title: 'Giá mua',
    dataIndex: 'buyRate',
    align: 'right',
    render: (value: number) => <Typography.Text strong>{value.toLocaleString('vi-VN')}</Typography.Text>,
  },
  {
    title: 'Giá bán',
    dataIndex: 'sellRate',
    align: 'right',
    render: (value: number) => <Typography.Text strong>{value.toLocaleString('vi-VN')}</Typography.Text>,
  },
  {
    title: 'Biên độ cho phép',
    dataIndex: 'adjustment',
    align: 'center',
    render: (value: string) => <Tag color="blue">{value}</Tag>,
  },
  {
    title: 'Cập nhật',
    dataIndex: 'updatedAt',
    align: 'center',
  },
  {
    title: 'Trạng thái',
    key: 'status',
    align: 'center',
    render: () => <Tag color="green">● ACTIVE</Tag>,
  },
];

export function ExchangeRatePage() {
  const { message } = App.useApp();
  const navigate = useNavigate();
  const role = useAuthStore((state) => state.user?.role);
  const canManageExchangeRate = hasPermission(role, 'exchange_rate.manage');
  const [form] = Form.useForm<PrimaryRateForm>();
  const [fundAForm] = Form.useForm<FundARateForm>();
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [hasPendingSubmission, setHasPendingSubmission] = useState(false);
  const [fundARates, setFundARates] = useState(fundARatesMock);
  const [editingFundARate, setEditingFundARate] = useState<FundARate | null>(null);
  const [isParseModalOpen, setIsParseModalOpen] = useState(false);
  const [parseFileList, setParseFileList] = useState<UploadFile[]>([]);
  const [isParsing, setIsParsing] = useState(false);
  const [parsedRates, setParsedRates] = useState<FundARate[] | null>(null);

  const fundAColumns: ColumnsType<FundARate> = canManageExchangeRate
    ? [...baseFundAColumns, {
      title: '',
      key: 'action',
      fixed: 'right',
      width: 96,
      render: (_, record) => (
        <Button
          type="text"
          icon={<EditOutlined />}
          onClick={() => {
            setEditingFundARate(record);
            fundAForm.setFieldsValue({
              buyRate: record.buyRate,
              sellRate: record.sellRate,
              adjustment: record.adjustment,
            });
          }}
        >
          Sửa
        </Button>
      ),
    }]
    : baseFundAColumns;

  const submitForApproval = async (values: PrimaryRateForm) => {
    if (!canManageExchangeRate) {
      await message.error('Bạn không có quyền chỉnh sửa tỷ giá');
      return;
    }
    setHasPendingSubmission(true);
    setIsModalOpen(false);
    form.resetFields();
    await message.success('Đã gửi bảng tỷ giá mới cho Giám đốc duyệt');
    void values;
  };

  const updateSingleFundARate = async (values: FundARateForm) => {
    if (!editingFundARate || !canManageExchangeRate) {
      await message.error('Chỉ GĐ và KTTH được chỉnh sửa tỷ giá Quỹ A');
      return;
    }

    setFundARates((current) =>
      current.map((rate) =>
        rate.key === editingFundARate.key
          ? { ...rate, ...values, updatedAt: new Date().toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' }) }
          : rate,
      ),
    );
    setEditingFundARate(null);
    await message.success(`Đã cập nhật tỷ giá ${editingFundARate.currency}`);
  };

  const parseRateImage = () => {
    if (!canManageExchangeRate) {
      void message.error('Chỉ GĐ và KTTH được parse bảng tỷ giá');
      return;
    }
    if (parseFileList.length === 0) {
      void message.warning('Vui lòng tải ảnh bảng tỷ giá');
      return;
    }

    setIsParsing(true);
    window.setTimeout(() => {
      setParsedRates(
        fundARates.map((rate, index) => ({
          ...rate,
          buyRate: rate.buyRate + (index % 3 === 0 ? 20 : 10),
          sellRate: rate.sellRate + (index % 2 === 0 ? 20 : 10),
          updatedAt: 'Vừa parse',
        })),
      );
      setIsParsing(false);
    }, 700);
  };

  const applyParsedRates = async () => {
    if (!parsedRates || !canManageExchangeRate) {
      await message.error('Chỉ GĐ và KTTH được áp dụng bảng tỷ giá');
      return;
    }
    setFundARates(parsedRates.map((rate) => ({ ...rate, updatedAt: 'Vừa áp dụng' })));
    setIsParseModalOpen(false);
    setParseFileList([]);
    setParsedRates(null);
    await message.success('GĐ/KTTH đã xác nhận và áp dụng bảng tỷ giá Quỹ A mới');
  };

  return (
    <PageScaffold
      title="Quản lý Tỷ Giá"
      description="Nhập và duyệt tỷ giá ngoại tệ áp dụng cho toàn hệ thống"
      moduleName="exchange-rate"
      extra={<Space wrap>
        <Button icon={<HistoryOutlined />} onClick={() => navigate('/exchange-rate/history')}>Lịch sử</Button>
      </Space>}
    >
      <Space direction="vertical" size={16} className="w-full">
        {hasPendingSubmission && (
          <Alert
            type="warning"
            showIcon
            message="Có bảng tỷ giá mới đang chờ Giám đốc duyệt"
            description=""
            action={<Button size="small">Xem bản chờ duyệt</Button>}
          />
        )}

        <Card
        title={"Tỷ giá áp dụng"}
          extra={
            <Space>
              {canManageExchangeRate ? (
                <Button icon={<EditOutlined />} onClick={() => setIsModalOpen(true)}>
                  Cập nhật tỷ giá
                </Button>
              ) : (
                <Tag>Chỉ xem</Tag>
              )}
            </Space>
          }
        >
          <Row gutter={[16, 16]}>
            {primaryRatesMock.map((rate) => (
              <Col xs={24} sm={12} xl={6} key={rate.label}>
                <RateCard {...rate} />
              </Col>
            ))}
          </Row>
        </Card>

        <Card
          title="Bảng tỷ giá Quỹ A"
          extra={
            <Space>
              {canManageExchangeRate ? (
                <Button icon={<SwapOutlined />} onClick={() => setIsParseModalOpen(true)}>
                  Parse tỷ giá Mua/Bán
                </Button>
              ) : (
                <Tag>Chỉ xem</Tag>
              )}
            </Space>}
        >
          <Table
            columns={fundAColumns}
            dataSource={fundARates}
            pagination={false}
            scroll={{ x: 820 }}
            size="middle"
          />
        </Card>
      </Space>

      <Modal
        title="Nhập 4 tỷ giá chính"
        open={isModalOpen}
        onCancel={() => setIsModalOpen(false)}
        footer={null}
        destroyOnClose
      >
        <Alert
          type="warning"
          showIcon
          message="Bảng mới sẽ ở trạng thái Chờ duyệt"
          description="Tỷ giá ACTIVE hiện tại không bị thay đổi cho đến khi Giám đốc phê duyệt."
          className="mb-4"
        />
        <Form<PrimaryRateForm>
          form={form}
          layout="vertical"
          initialValues={{
            paidSell: 25650,
            paidSellAdjustment: '',
            paidBuy: 25580,
            paidBuyAdjustment: '±20',
            sell: 25720,
            sellAdjustment: '±30',
            buy: 25600,
            buyAdjustment: '±30',
          }}
          onFinish={submitForApproval}
        >
          <Row gutter={12}>
            <Col span={12}>
              <Form.Item name="paidSell" label="Paid (WU/MG) Bán" rules={[{ required: true }]}>
                <InputNumber min={0} controls={false} className="w-full" />
              </Form.Item>
            </Col>
            <Col span={12}>
              <Form.Item name="paidBuy" label="Paid Mua" rules={[{ required: true }]}>
                <InputNumber min={0} controls={false} className="w-full" />
              </Form.Item>
            </Col>
            <Col span={12}>
              <Form.Item name="sell" label="Giá Bán" rules={[{ required: true }]}>
                <InputNumber min={0} controls={false} className="w-full" />
              </Form.Item>
            </Col>
            <Col span={12}>
              <Form.Item name="buy" label="Giá Mua" rules={[{ required: true }]}>
                <InputNumber min={0} controls={false} className="w-full" />
              </Form.Item>
            </Col>
          </Row>
          <Row gutter={12}>
            <Col span={12}>
              <Form.Item name="paidSellAdjustment" label="Biên độ Paid Bán" rules={[{ required: true }]}>
                <Input placeholder="Ví dụ: ±20" />
              </Form.Item>
            </Col>
            <Col span={12}>
              <Form.Item name="paidBuyAdjustment" label="Biên độ Paid Mua" rules={[{ required: true }]}>
                <Input placeholder="Ví dụ: ±20" />
              </Form.Item>
            </Col>
            <Col span={12}>
              <Form.Item name="sellAdjustment" label="Biên độ Giá Bán" rules={[{ required: true }]}>
                <Input placeholder="Ví dụ: ±30" />
              </Form.Item>
            </Col>
            <Col span={12}>
              <Form.Item name="buyAdjustment" label="Biên độ Giá Mua" rules={[{ required: true }]}>
                <Input placeholder="Ví dụ: ±30" />
              </Form.Item>
            </Col>
          </Row>
          <Form.Item name="note" label="Ghi chú trình duyệt">
            <Input.TextArea rows={3} placeholder="Lý do điều chỉnh tỷ giá" />
          </Form.Item>
          <Space className="flex justify-end">
            <Button onClick={() => setIsModalOpen(false)}>Hủy</Button>
            <Button type="primary" htmlType="submit" icon={<SendOutlined />}>
              Gửi Giám đốc duyệt
            </Button>
          </Space>
        </Form>
      </Modal>

      <Modal
        title={editingFundARate ? `Sửa tỷ giá ${editingFundARate.currency}` : 'Sửa tỷ giá Quỹ A'}
        open={Boolean(editingFundARate)}
        onCancel={() => setEditingFundARate(null)}
        footer={null}
        destroyOnClose
      >
        <Form<FundARateForm> form={fundAForm} layout="vertical" onFinish={updateSingleFundARate}>
          <Row gutter={12}>
            <Col span={12}>
              <Form.Item name="buyRate" label="Giá mua" rules={[{ required: true }]}>
                <InputNumber min={0} controls={false} className="w-full" />
              </Form.Item>
            </Col>
            <Col span={12}>
              <Form.Item name="sellRate" label="Giá bán" rules={[{ required: true }]}>
                <InputNumber min={0} controls={false} className="w-full" />
              </Form.Item>
            </Col>
          </Row>
          <Form.Item name="adjustment" label="Biên độ cho phép" rules={[{ required: true }]}>
            <Input placeholder="Ví dụ: ±100" />
          </Form.Item>
          <Space className="flex justify-end">
            <Button onClick={() => setEditingFundARate(null)}>Hủy</Button>
            <Button type="primary" htmlType="submit" icon={<SaveOutlined />}>Lưu tỷ giá</Button>
          </Space>
        </Form>
      </Modal>

      <Modal
        title="Parse bảng tỷ giá Quỹ A từ ảnh"
        open={isParseModalOpen}
        width={920}
        onCancel={() => {
          setIsParseModalOpen(false);
          setParsedRates(null);
          setParseFileList([]);
        }}
        footer={null}
        destroyOnClose
      >
        {!parsedRates ? (
          <Space direction="vertical" size={16} className="w-full">
            <Alert
              type="info"
              showIcon
              message="Upload ảnh → Backend parse → Preview bảng mới → GĐ/KTTH xác nhận áp dụng"
            />
            <Upload.Dragger
              accept="image/*"
              maxCount={1}
              fileList={parseFileList}
              beforeUpload={(file) => {
                setParseFileList([file]);
                return false;
              }}
              onRemove={() => {
                setParseFileList([]);
              }}
            >
              <p className="ant-upload-drag-icon"><UploadOutlined /></p>
              <p className="ant-upload-text">Chọn hoặc kéo ảnh bảng tỷ giá vào đây</p>
              <p className="ant-upload-hint">Hỗ trợ PNG, JPG, JPEG. Ảnh sẽ được gửi backend để nhận diện.</p>
            </Upload.Dragger>
            <Space className="flex justify-end">
              <Button onClick={() => setIsParseModalOpen(false)}>Hủy</Button>
              <Button type="primary" loading={isParsing} icon={<SwapOutlined />} onClick={parseRateImage}>
                Gửi backend parse
              </Button>
            </Space>
          </Space>
        ) : (
          <Space direction="vertical" size={16} className="w-full">
            <Alert
              type="warning"
              showIcon
              message="Kiểm tra bảng tỷ giá mới trước khi áp dụng"
              description="Chỉ GĐ hoặc KTTH được xác nhận. Khi áp dụng, bảng hiện tại sẽ được lưu vào lịch sử."
            />
            <Table
              rowKey="key"
              size="small"
              pagination={false}
              scroll={{ x: 760 }}
              dataSource={parsedRates}
              columns={[
                { title: 'Ngoại tệ', dataIndex: 'currency', fixed: 'left' },
                {
                  title: 'Giá mua hiện tại',
                  key: 'currentBuy',
                  align: 'right',
                  render: (_, record) => fundARates.find((rate) => rate.key === record.key)?.buyRate.toLocaleString('vi-VN'),
                },
                { title: 'Giá mua mới', dataIndex: 'buyRate', align: 'right', render: (value: number) => <Typography.Text strong>{value.toLocaleString('vi-VN')}</Typography.Text> },
                {
                  title: 'Giá bán hiện tại',
                  key: 'currentSell',
                  align: 'right',
                  render: (_, record) => fundARates.find((rate) => rate.key === record.key)?.sellRate.toLocaleString('vi-VN'),
                },
                { title: 'Giá bán mới', dataIndex: 'sellRate', align: 'right', render: (value: number) => <Typography.Text strong>{value.toLocaleString('vi-VN')}</Typography.Text> },
                { title: 'Biên độ', dataIndex: 'adjustment', align: 'center' },
              ]}
            />
            <Space className="flex justify-end">
              <Button onClick={() => setParsedRates(null)}>Chọn ảnh khác</Button>
              <Button type="primary" icon={<CheckCircleOutlined />} onClick={applyParsedRates}>
                GĐ/KTTH xác nhận và áp dụng
              </Button>
            </Space>
          </Space>
        )}
      </Modal>
    </PageScaffold>
  );
}
