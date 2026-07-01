import { Card, Space, Tag, Typography } from 'antd';
import type { ReactNode } from 'react';
import { usePageTitle } from '@/shared/hooks/usePageTitle';

type PageScaffoldProps = {
  title: string;
  description: string;
  moduleName: string;
  children?: ReactNode;
  extra?: ReactNode;
};

export function PageScaffold({ title, description, moduleName, children, extra }: PageScaffoldProps) {
  usePageTitle(title);

  return (
    <>
      <div className="mb-4 flex items-start justify-between gap-4 max-sm:flex-col">
        <div>
          <Typography.Title className="m-0! text-2xl! leading-tight!" level={1}>
            {title}
          </Typography.Title>
          <p className="mt-1.5 mb-0 max-w-3xl text-slate-500">{description}</p>
        </div>
        {extra && <div className="flex justify-end">{extra}</div>}

      </div>
      {children ?? (
        <Card>
          <Space direction="vertical" size={12}>
            <Tag color="green">{moduleName}</Tag>
            <Typography.Text>
              Màn hình đã được đặt trong đúng bounded context để nối API, bảng dữ liệu,
              workflow duyệt và phân quyền theo từng vai trò.
            </Typography.Text>
          </Space>
        </Card>
      )}
    </>
  );
}
