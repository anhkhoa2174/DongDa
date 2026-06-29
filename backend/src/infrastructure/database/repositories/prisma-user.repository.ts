// Prisma User Repository Implementation
// Layer: Infrastructure — implements IUserRepository bằng Prisma

import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma.service';
import { IUserRepository } from '../../../domain/repositories/user.repository';
import { User, UserRole } from '../../../domain/entities/user.entity';

@Injectable()
export class PrismaUserRepository implements IUserRepository {
  constructor(private readonly prisma: PrismaService) {}

  async findById(id: string): Promise<User | null> {
    const row = await this.prisma.user.findUnique({ where: { id } });
    return row ? this.toDomain(row) : null;
  }

  async findByUsername(username: string): Promise<User | null> {
    const row = await this.prisma.user.findUnique({ where: { username } });
    return row ? this.toDomain(row) : null;
  }

  async findByEmail(email: string): Promise<User | null> {
    const row = await this.prisma.user.findUnique({ where: { email } });
    return row ? this.toDomain(row) : null;
  }

  async findAll(filter?: { role?: UserRole; branchId?: string; isActive?: boolean }): Promise<User[]> {
    const rows = await this.prisma.user.findMany({
      where: {
        ...(filter?.role && { role: filter.role }),
        ...(filter?.branchId && { branchId: filter.branchId }),
        ...(filter?.isActive !== undefined && { isActive: filter.isActive }),
      },
      orderBy: { createdAt: 'desc' },
    });
    return rows.map(this.toDomain);
  }

  async save(user: Omit<User, 'id' | 'createdAt' | 'updatedAt'>): Promise<User> {
    const row = await this.prisma.user.create({
      data: {
        username: user.username,
        email: user.email,
        password: user.password,
        fullName: user.fullName,
        role: user.role,
        branchId: user.branchId ?? null,
        isActive: user.isActive,
      },
    });
    return this.toDomain(row);
  }

  async update(
    id: string,
    data: Partial<Pick<User, 'fullName' | 'email' | 'password' | 'isActive' | 'branchId' | 'role'>>,
  ): Promise<User> {
    const row = await this.prisma.user.update({ where: { id }, data });
    return this.toDomain(row);
  }

  async deactivate(id: string): Promise<User> {
    const row = await this.prisma.user.update({
      where: { id },
      data: { isActive: false },
    });
    return this.toDomain(row);
  }

  async existsAdmin(): Promise<boolean> {
    const count = await this.prisma.user.count({ where: { role: 'ADMIN' } });
    return count > 0;
  }

  private toDomain(row: any): User {
    return {
      id: row.id,
      username: row.username,
      email: row.email,
      password: row.password,
      fullName: row.fullName,
      role: row.role as UserRole,
      branchId: row.branchId ?? undefined,
      isActive: row.isActive,
      createdAt: row.createdAt,
      updatedAt: row.updatedAt,
    };
  }
}
