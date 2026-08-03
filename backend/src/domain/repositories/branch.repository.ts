// Repository Interface: Branch (Port) — read-only reference data
// Layer: Domain

export interface BranchRef {
  id: string;
  code: string;
  name: string;
  type: string; // HEAD_OFFICE | BRANCH
  address?: string | null;
  phone?: string | null;
}

export interface CreateBranchInput {
  code: string;
  name: string;
  address?: string;
  phone?: string;
}

export interface IBranchRepository {
  list(): Promise<BranchRef[]>;
  create(input: CreateBranchInput): Promise<BranchRef>;
}
