// Prisma Branch Repository
// Layer: Infrastructure

import { BadRequestException, ConflictException, Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma.service';
import {
  BranchRef, CreateBranchInput, IBranchRepository,
} from '../../../domain/repositories/branch.repository';

const FUND_A_CURRENCIES = [
  'EUR', 'AUD', 'JPY', 'GBP', 'SGD', 'THB', 'CNY', 'HKD', 'KRW',
  'CAD', 'CHF', 'NZD', 'TWD', 'MYR', 'IDR', 'PHP', 'LAK', 'KHR',
] as const;

@Injectable()
export class PrismaBranchRepository implements IBranchRepository {
  constructor(private readonly prisma: PrismaService) {}

  async list(): Promise<BranchRef[]> {
    const rows = await this.prisma.branch.findMany({
      where: { status: 'ACTIVE' },
      orderBy: [{ type: 'asc' }, { code: 'asc' }],
    });
    return rows.map(toBranchRef);
  }

  async create(input: CreateBranchInput): Promise<BranchRef> {
    const headOffice = await this.prisma.branch.findFirst({
      where: { type: 'HEAD_OFFICE', status: 'ACTIVE' },
      select: { company_id: true },
    });
    if (!headOffice) throw new BadRequestException('Chưa cấu hình Hội sở (HO)');

    try {
      const branch = await this.prisma.$transaction(async (tx) => {
        const created = await tx.branch.create({
          data: {
            company_id: headOffice.company_id,
            code: input.code.trim().toUpperCase(),
            name: input.name.trim(),
            type: 'BRANCH',
            address: input.address?.trim() || null,
            phone: input.phone?.trim() || null,
          },
        });
        await tx.fund_accounts.createMany({
          data: [
            {
              branch_id: created.id,
              code: 'CASH_VND',
              name: 'Quỹ tiền mặt VND',
              account_type: 'CASH',
              currency_code: 'VND',
            },
            {
              branch_id: created.id,
              code: 'CASH_USD',
              name: 'Quỹ tiền mặt USD',
              account_type: 'CASH',
              currency_code: 'USD',
            },
            ...FUND_A_CURRENCIES.map((currency) => ({
              branch_id: created.id,
              code: `FUND_A_${currency}`,
              name: `Quỹ A ${currency}`,
              account_type: 'FUND_A' as const,
              currency_code: currency,
            })),
          ],
        });
        return created;
      });
      return toBranchRef(branch);
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
        throw new ConflictException('Mã chi nhánh đã tồn tại');
      }
      throw error;
    }
  }
}

function toBranchRef(row: any): BranchRef {
  return {
    id: row.id,
    code: row.code,
    name: row.name,
    type: row.type,
    address: row.address ?? null,
    phone: row.phone ?? null,
  };
}
