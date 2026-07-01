import { CheckOutlined, MinusOutlined } from '@ant-design/icons';
import { Card, Table, Tag, Typography } from 'antd';
import { PageScaffold } from '@/shared/components/PageScaffold';

const roles = ['Giám đốc', 'KTTH', 'Trưởng CN', 'NV CN', 'Auditor'] as const;
type Cell = 'YES' | 'NO' | 'READ';

const rows: { feature: string; values: Cell[] }[] = [
  { feature: 'Xem toàn hệ thống',      values: ['YES', 'YES', 'NO',  'NO',  'READ'] },
  { feature: 'Nhập tỷ giá',            values: ['NO',  'YES', 'NO',  'NO',  'NO']   },
  { feature: 'Phê duyệt tỷ giá',       values: ['YES', 'NO',  'NO',  'NO',  'NO']   },
  { feature: 'Tạo GD WU/MG',           values: ['NO',  'NO',  'YES', 'YES', 'NO']   },
  { feature: 'Sửa GD',                 values: ['NO',  'YES', 'YES', 'YES', 'NO']   },
  { feature: 'Void GD',                values: ['NO',  'YES', 'YES', 'NO',  'NO']   },
  { feature: 'Mở/đóng ca',             values: ['NO',  'NO',  'YES', 'YES', 'NO']   },
  { feature: 'Điều động vốn',          values: ['YES', 'YES', 'YES', 'NO',  'NO']   },
  { feature: 'Duyệt điều động',        values: ['YES', 'YES', 'NO',  'NO',  'NO']   },
  { feature: 'Đối chiếu Journal',      values: ['YES', 'YES', 'NO',  'NO',  'NO']   },
  { feature: 'Xem báo cáo CN mình',    values: ['YES', 'YES', 'YES', 'YES', 'READ'] },
  { feature: 'Xem báo cáo toàn hệ',    values: ['YES', 'YES', 'NO',  'NO',  'READ'] },
  { feature: 'Audit log',              values: ['YES', 'YES', 'NO',  'NO',  'READ'] },
  { feature: 'Quản lý người dùng',     values: ['YES', 'NO',  'NO',  'NO',  'NO']   },
  { feature: 'Override hệ thống',      values: ['YES', 'NO',  'NO',  'NO',  'NO']   },
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
