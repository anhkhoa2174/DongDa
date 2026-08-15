// Prisma User Repository Implementation
// Layer: Infrastructure — implements IUserRepository bằng Prisma
//
// Schema v3 tách user/employee/role:
//   users      : username, password_hash, status
//   employees  : full_name, email, branch_id  (1-1 với users qua employee_id)
//   user_roles : (user_id, role_id) → roles.code = UserRole
// Repository map các bảng đó về domain User "phẳng" để phần còn lại của app không đổi.

import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma.service';
import { IUserRepository } from '../../../domain/repositories/user.repository';
import { User, UserRole } from '../../../domain/entities/user.entity';

const INCLUDE = {
  employees: { include: { branches: true } },
  user_roles: { include: { roles: true } },
} as const;

@Injectable()
export class PrismaUserRepository implements IUserRepository {
  constructor(private readonly prisma: PrismaService) {}

  async findById(id: string): Promise<User | null> {
    const row = await this.prisma.user.findUnique({ where: { id }, include: INCLUDE });
    return row ? toDomain(row) : null;
  }

  async findByUsername(username: string): Promise<User | null> {
    const row = await this.prisma.user.findUnique({ where: { username }, include: INCLUDE });
    return row ? toDomain(row) : null;
  }

  async findByEmail(email: string): Promise<User | null> {
    const row = await this.prisma.user.findFirst({
      where: { employees: { email } },
      include: INCLUDE,
    });
    return row ? toDomain(row) : null;
  }

  async findAll(filter?: { role?: UserRole; branchId?: string; isActive?: boolean }): Promise<User[]> {
    const rows = await this.prisma.user.findMany({
      where: {
        ...(filter?.role && { user_roles: { some: { roles: { code: filter.role } } } }),
        ...(filter?.branchId && { employees: { branch_id: filter.branchId } }),
        ...(filter?.isActive !== undefined && { status: filter.isActive ? 'ACTIVE' : 'INACTIVE' }),
      },
      include: INCLUDE,
      orderBy: { created_at: 'desc' },
    });
    return rows.map(toDomain).filter((user): user is User => user !== null);
  }

  async save(user: Omit<User, 'id' | 'createdAt' | 'updatedAt'>): Promise<User> {
    // branchId bắt buộc ở DB (employees.branch_id NOT NULL) — ADMIN/AUDITOR gán về Hội sở
    const branchId = user.branchId ?? (await this.headOfficeBranchId());
    const role = await this.prisma.roles.findUnique({ where: { code: user.role } });
    if (!role) throw new Error(`Role không tồn tại: ${user.role}`);

    const newUserId = await this.prisma.$transaction(async (tx) => {
      const employee = await tx.employees.create({
        data: {
          branch_id: branchId,
          employee_code: `EMP_${user.username.toUpperCase()}`,
          full_name: user.fullName,
          email: user.email ?? null,
          status: 'ACTIVE',
        },
      });
      const created = await tx.user.create({
        data: {
          employee_id: employee.id,
          username: user.username,
          password_hash: user.password,
          status: user.isActive ? 'ACTIVE' : 'INACTIVE',
        },
      });
      await tx.user_roles.create({ data: { user_id: created.id, role_id: role.id } });
      return created.id;
    });

    return (await this.findById(newUserId))!;
  }

  async update(
    id: string,
    data: Partial<Pick<User, 'fullName' | 'email' | 'password' | 'isActive' | 'branchId' | 'role'>>,
  ): Promise<User> {
    const current = await this.prisma.user.findUnique({ where: { id }, include: INCLUDE });
    if (!current) throw new Error('User không tồn tại');

    await this.prisma.$transaction(async (tx) => {
      // Field thuộc bảng users
      if (data.password !== undefined || data.isActive !== undefined) {
        await tx.user.update({
          where: { id },
          data: {
            ...(data.password !== undefined && { password_hash: data.password }),
            ...(data.isActive !== undefined && { status: data.isActive ? 'ACTIVE' : 'INACTIVE' }),
          },
        });
      }
      // Field thuộc bảng employees
      if (data.fullName !== undefined || data.email !== undefined || data.branchId !== undefined) {
        await tx.employees.update({
          where: { id: current.employee_id },
          data: {
            ...(data.fullName !== undefined && { full_name: data.fullName }),
            ...(data.email !== undefined && { email: data.email || null }),
            ...(data.branchId !== undefined && { branch_id: data.branchId }),
          },
        });
      }
      // Đổi role → thay bản ghi user_roles
      if (data.role !== undefined) {
        const role = await tx.roles.findUnique({ where: { code: data.role } });
        if (!role) throw new Error(`Role không tồn tại: ${data.role}`);
        await tx.user_roles.deleteMany({ where: { user_id: id } });
        await tx.user_roles.create({ data: { user_id: id, role_id: role.id } });
      }
    });

    return (await this.findById(id))!;
  }

  async deactivate(id: string): Promise<User> {
    await this.prisma.user.update({ where: { id }, data: { status: 'INACTIVE' } });
    return (await this.findById(id))!;
  }

  async existsAdmin(): Promise<boolean> {
    const count = await this.prisma.user.count({
      where: { user_roles: { some: { roles: { code: 'ADMIN' } } } },
    });
    return count > 0;
  }

  private async headOfficeBranchId(): Promise<string> {
    const ho = await this.prisma.branch.findFirst({ where: { type: 'HEAD_OFFICE' } });
    if (!ho) throw new Error('Chưa có chi nhánh Hội sở (HEAD_OFFICE) — chạy seed trước');
    return ho.id;
  }
}

// Map bản ghi users (kèm employees + user_roles.roles) → domain User phẳng
function toDomain(row: any): User | null {
  if (!Array.isArray(row.user_roles) || row.user_roles.length !== 1) return null;
  const roleCode = row.user_roles[0]?.roles?.code as UserRole | undefined;
  if (!roleCode || !Object.values(UserRole).includes(roleCode)) return null;
  return {
    id: row.id,
    username: row.username,
    email: row.employees?.email ?? undefined,
    password: row.password_hash,
    fullName: row.employees?.full_name ?? '',
    role: roleCode,
    branchId: row.employees?.branch_id ?? undefined,
    branchName: row.employees?.branches?.name ?? undefined,
    isActive: row.status === 'ACTIVE',
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}
