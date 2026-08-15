import type { RouteObject } from 'react-router-dom';
import { TransactionsMainPage } from './pages/TransactionsMainPage';

export const transactionRoutes: RouteObject[] = [
  { path: 'transactions', element: <TransactionsMainPage /> },
];
