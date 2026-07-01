import { BranchFundsPage, CentralFundPage } from './pages/FundManagementPage';

export const fundManagementRoutes = [
  {
    path: 'fund-management/branch-funds',
    element: <BranchFundsPage />,
  },
  {
    path: 'fund-management/central-fund',
    element: <CentralFundPage />,
  },
];
