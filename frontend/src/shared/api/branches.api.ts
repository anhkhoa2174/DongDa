import { httpClient } from './httpClient';

export interface BranchOptionDto {
  id: string;
  code: string;
  name: string;
  type: 'HEAD_OFFICE' | 'BRANCH' | string;
}

export const branchesApi = {
  list: () => httpClient.get<BranchOptionDto[]>('/branches').then((response) => response.data),
};
