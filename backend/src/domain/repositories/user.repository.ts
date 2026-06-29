// Repository Interface: User
// Layer: Domain (Port)

import type { User, UserRole } from '../entities/user.entity';

export interface IUserRepository {
  findById(id: string): Promise<User | null>;
  findByUsername(username: string): Promise<User | null>;
  findByEmail(email: string): Promise<User | null>;
  findAll(filter?: { role?: UserRole; branchId?: string; isActive?: boolean }): Promise<User[]>;
  save(user: Omit<User, 'id' | 'createdAt' | 'updatedAt'>): Promise<User>;
  update(id: string, data: Partial<Pick<User, 'fullName' | 'email' | 'password' | 'isActive' | 'branchId' | 'role'>>): Promise<User>;
  // Không xóa user — chỉ deactivate (audit trail)
  deactivate(id: string): Promise<User>;
  existsAdmin(): Promise<boolean>;
}
