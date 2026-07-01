import {
  CheckCircleOutlined,
  LockOutlined,
  SafetyCertificateOutlined,
} from '@ant-design/icons';

export const loginBranchesMock = [
  { value: 'hq', label: 'HQ - Trụ sở chính' },
  { value: 'nct', label: 'CN NCT' },
  { value: 'tao-dan', label: 'CN Tao Đàn' },
  { value: 'le-hong-phong', label: 'CN Lê Hồng Phong' },
  { value: 'bay-hien', label: 'CN Bảy Hiền' },
  { value: 'an-dong', label: 'CN An Đông' },
];

export const loginFormDefaultsMock = {
  username: 'director',
  password: '123456',
};

export const defaultLoginBranchMock = 'hq';

export const loginHighlightsMock = [
  { icon: <SafetyCertificateOutlined />, label: 'Phân quyền chặt chẽ theo vai trò và chi nhánh' },
  { icon: <CheckCircleOutlined />, label: 'Đối chiếu tự động WU/MG Journal' },
  { icon: <LockOutlined />, label: 'Audit đầy đủ và bảo mật cho vai trò quản lý' },
];
