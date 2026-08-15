import { ArrowLeftOutlined } from '@ant-design/icons';
import { Button } from 'antd';
import type { ReactNode } from 'react';
import { useNavigate } from 'react-router-dom';
import { PageScaffold } from '@/shared/components/PageScaffold';

type TransactionCreatePageProps = {
  title: string;
  description: string;
  moduleName: string;
  children: ReactNode;
};

export function TransactionCreatePage({ title, description, moduleName, children }: TransactionCreatePageProps) {
  const navigate = useNavigate();
  return (
    <PageScaffold
      title={title}
      description={description}
      moduleName={moduleName}
      extra={(
        <Button icon={<ArrowLeftOutlined />} onClick={() => navigate('/transactions')}>
          Quay lại Giao Dịch
        </Button>
      )}
    >
      {children}
    </PageScaffold>
  );
}
