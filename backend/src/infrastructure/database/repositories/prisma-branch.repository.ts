// Prisma Branch Repository — read-only reference
// Layer: Infrastructure

import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma.service';
import { IBranchRepository, BranchRef } from '../../../domain/repositories/branch.repository';

@Injectable()
export class PrismaBranchRepository implements IBranchRepository {
  constructor(private readonly prisma: PrismaService) {}

  async list(): Promise<BranchRef[]> {
    const rows = await this.prisma.branch.findMany({
      where: { status: 'ACTIVE' },
      orderBy: [{ type: 'asc' }, { code: 'asc' }],
    });
    return rows.map((r) => ({ id: r.id, code: r.code, name: r.name, type: r.type }));
  }
}
