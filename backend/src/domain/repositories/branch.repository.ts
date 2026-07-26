// Repository Interface: Branch (Port) — read-only reference data
// Layer: Domain

export interface BranchRef {
  id: string;
  code: string;
  name: string;
  type: string; // HEAD_OFFICE | BRANCH
}

export interface IBranchRepository {
  list(): Promise<BranchRef[]>;
}
