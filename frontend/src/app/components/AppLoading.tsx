import { Spin } from 'antd';

export function AppLoading() {
  return (
    <div className="grid min-h-screen place-items-center bg-white">
      <Spin size="large" />
    </div>
  );
}
