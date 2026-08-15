import { CheckOutlined, MinusOutlined } from '@ant-design/icons';
import { Card, Table, Tag, Typography } from 'antd';
import { PageScaffold } from '@/shared/components/PageScaffold';

const roles = ['ADMIN', 'MANAGER', 'STAFF', 'AUDITOR'] as const;
type Cell = 'YES' | 'NO' | 'READ';

const rows: { feature: string; values: Cell[] }[] = [
  { feature: 'Toàn quyền hệ thống',        values: ['YES', 'NO',  'NO',  'NO']   },
  { feature: 'Xem giao dịch',              values: ['YES', 'YES', 'YES', 'READ'] },
  { feature: 'Tạo GD WU/MG/FX/Chuyển tiền', values: ['YES', 'YES', 'YES', 'NO']   },
  { feature: 'Duyệt/void giao dịch',       values: ['YES', 'YES', 'NO',  'NO']   },
  { feature: 'Mở/đóng ca',                 values: ['YES', 'YES', 'YES', 'READ'] },
  { feature: 'Xem tỷ giá',                 values: ['YES', 'YES', 'YES', 'READ'] },
  { feature: 'Quản lý tỷ giá',             values: ['YES', 'NO',  'NO',  'NO']   },
  { feature: 'Tiếp quỹ',                   values: ['YES', 'YES', 'YES', 'NO']   },
  { feature: 'Ngân hàng/Công nợ',          values: ['YES', 'YES', 'NO',  'READ'] },
  { feature: 'Đối chiếu Journal',          values: ['YES', 'YES', 'NO',  'READ'] },
  { feature: 'Báo cáo',                    values: ['YES', 'YES', 'NO',  'READ'] },
  { feature: 'Audit log',                  values: ['YES', 'NO',  'NO',  'READ'] },
  { feature: 'Quản lý người dùng',         values: ['YES', 'NO',  'NO',  'NO']   },
];

function PermissionCell({ value }: Readonly<{ value: Cell }>) {
  if (value === 'YES')  return <CheckOutlined className="text-green-600" />;
  if (value === 'READ') return <Tag color="blue">Read</Tag>;
  return <MinusOutlined className="text-slate-300" />;
}

export function PermissionMatrixPage() {
  return (
    <PageScaffold
      title="Ma trận phân quyền"
      description="Định nghĩa quyền của từng vai trò trong hệ thống — tham chiếu §2.1 quy trình vận hành."
      moduleName="user-management"
    >
      <Card>
        <Table
          rowKey="feature"
          pagination={false}
          dataSource={rows}
          columns={[
            {
              title: 'Chức năng',
              dataIndex: 'feature',
              fixed: 'left',
              width: 260,
              render: (v: string) => <Typography.Text strong>{v}</Typography.Text>,
            },
            ...roles.map((r, idx) => ({
              title: r,
              key: r,
              align: 'center' as const,
              render: (_: unknown, row: { values: Cell[] }) => <PermissionCell value={row.values[idx]} />,
            })),
          ]}
        />
      </Card>
    </PageScaffold>
  );
}
