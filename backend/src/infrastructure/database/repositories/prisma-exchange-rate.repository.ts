// Prisma ExchangeRate Repository Implementation
// Layer: Infrastructure

import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma.service';
import {
  IExchangeRateRepository,
  CreateExchangeRateData,
  ListRatesFilter,
  ExchangeRateHistoryFilter,
  ExchangeRateHistoryResult,
} from '../../../domain/repositories/exchange-rate.repository';
import { Prisma } from '@prisma/client';
import {
  ExchangeRate,
  ExchangeRateType,
  RateStatus,
  ServiceProvider,
  CurrencyCode,
} from '../../../domain/entities/exchange-rate.entity';

@Injectable()
export class PrismaExchangeRateRepository implements IExchangeRateRepository {
  constructor(private readonly prisma: PrismaService) {}

  async create(data: CreateExchangeRateData): Promise<ExchangeRate> {
    const row = await this.prisma.exchange_rates.create({
      data: {
        rate_type: data.rateType,
        provider: data.provider ?? null,
        from_currency: data.fromCurrency,
        to_currency: data.toCurrency,
        buy_rate: data.buyRate ?? null,
        sell_rate: data.sellRate ?? null,
        rate: data.rate,
        effective_from: data.effectiveFrom,
        status: 'DRAFT',
        created_by_user_id: data.createdByUserId,
      },
    });
    return toDomain(row);
  }

  async createMany(items: CreateExchangeRateData[]): Promise<ExchangeRate[]> {
    return this.prisma.$transaction(async (tx) => {
      const created = [];
      for (const data of items) {
        created.push(await tx.exchange_rates.create({ data: {
          rate_type: data.rateType, provider: data.provider ?? null,
          from_currency: data.fromCurrency, to_currency: data.toCurrency,
          buy_rate: data.buyRate ?? null, sell_rate: data.sellRate ?? null,
          rate: data.rate, effective_from: data.effectiveFrom,
          status: 'DRAFT', created_by_user_id: data.createdByUserId,
        }}));
      }
      return created.map(toDomain);
    });
  }

  async findById(id: string): Promise<ExchangeRate | null> {
    const row = await this.prisma.exchange_rates.findUnique({ where: { id } });
    return row ? toDomain(row) : null;
  }

  async findMany(filter?: ListRatesFilter): Promise<ExchangeRate[]> {
    const rows = await this.prisma.exchange_rates.findMany({
      where: {
        ...(filter?.status && { status: filter.status }),
        ...(filter?.rateType && { rate_type: filter.rateType }),
        ...(filter?.provider && { provider: filter.provider }),
        ...(filter?.fromCurrency && { from_currency: filter.fromCurrency }),
      },
      orderBy: { effective_from: 'desc' },
    });
    return rows.map(toDomain);
  }

  async findActive(filter?: Omit<ListRatesFilter, 'status'>): Promise<ExchangeRate[]> {
    const now = new Date();
    const rows = await this.prisma.exchange_rates.findMany({
      where: {
        status: RateStatus.ACTIVE,
        effective_from: { lte: now },
        OR: [{ effective_to: null }, { effective_to: { gt: now } }],
        ...(filter?.rateType && { rate_type: filter.rateType }),
        ...(filter?.provider && { provider: filter.provider }),
        ...(filter?.fromCurrency && { from_currency: filter.fromCurrency }),
      },
      orderBy: { effective_from: 'desc' },
    });
    return rows.map(toDomain);
  }

  async findHistory(filter: ExchangeRateHistoryFilter): Promise<ExchangeRateHistoryResult> {
    const keyword = filter.keyword?.trim();
    const where: Prisma.exchange_ratesWhereInput = {
      ...(filter.status && { status: filter.status }),
      ...(filter.rateType && { rate_type: filter.rateType }),
      ...((filter.createdFrom || filter.createdToExclusive) && {
        created_at: {
          ...(filter.createdFrom && { gte: filter.createdFrom }),
          ...(filter.createdToExclusive && { lt: filter.createdToExclusive }),
        },
      }),
      ...(keyword && {
        users_exchange_rates_created_by_user_idTousers: {
          employees: {
            full_name: { contains: keyword, mode: 'insensitive' },
          },
        },
      }),
    };

    const [total, rows] = await this.prisma.$transaction([
      this.prisma.exchange_rates.count({ where }),
      this.prisma.exchange_rates.findMany({
        where,
        include: {
          users_exchange_rates_created_by_user_idTousers: {
            select: { employees: { select: { full_name: true } } },
          },
          users_exchange_rates_approved_by_user_idTousers: {
            select: { employees: { select: { full_name: true } } },
          },
        },
        orderBy: [{ created_at: 'desc' }, { id: 'desc' }],
        skip: (filter.page - 1) * filter.pageSize,
        take: filter.pageSize,
      }),
    ]);

    return {
      items: rows.map((row) => ({
        ...toDomain(row),
        createdByName: row.users_exchange_rates_created_by_user_idTousers.employees.full_name,
        approvedByName: row.users_exchange_rates_approved_by_user_idTousers?.employees.full_name ?? null,
      })),
      total,
      page: filter.page,
      pageSize: filter.pageSize,
    };
  }

  async approveAndSupersede(id: string, approverUserId: string): Promise<ExchangeRate> {
    const now = new Date();
    const updated = await this.prisma.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT id FROM exchange_rates WHERE id = ${id}::uuid FOR UPDATE`;
      const target = await tx.exchange_rates.findUnique({ where: { id } });
      if (!target) throw new Error('Tỷ giá không tồn tại');
      if (target.status !== 'DRAFT') throw new Error(`Chỉ duyệt được tỷ giá DRAFT (hiện tại: ${target.status})`);
      if (target.effective_from.getTime() > now.getTime()) {
        throw new Error('Chưa thể kích hoạt tỷ giá trước thời điểm hiệu lực');
      }
      await tx.$queryRaw`SELECT pg_advisory_xact_lock(hashtext(${`${target.rate_type}:${target.provider ?? ''}:${target.from_currency}:${target.to_currency}`}))`;
      // 1. Supersede bản ACTIVE cùng identity (BR-F2.3-01: chỉ 1 active/identity)
      await tx.exchange_rates.updateMany({
        where: {
          status: 'ACTIVE',
          rate_type: target.rate_type,
          provider: target.provider,
          from_currency: target.from_currency,
          to_currency: target.to_currency,
          id: { not: id },
        },
        data: { status: 'SUPERSEDED', effective_to: now },
      });

      // 2. Set bản này ACTIVE
      return tx.exchange_rates.update({
        where: { id },
        data: {
          status: 'ACTIVE',
          approved_by_user_id: approverUserId,
          approved_at: now,
        },
      });
    });

    return toDomain(updated);
  }

  async reject(id: string): Promise<ExchangeRate> {
    const row = await this.prisma.exchange_rates.update({
      where: { id },
      data: { status: 'REJECTED' },
    });
    return toDomain(row);
  }
}

function toDomain(row: any): ExchangeRate {
  const num = (v: any): number | null => (v === null || v === undefined ? null : Number(v));
  return {
    id: row.id,
    rateType: row.rate_type as ExchangeRateType,
    provider: (row.provider as ServiceProvider) ?? null,
    fromCurrency: row.from_currency as CurrencyCode,
    toCurrency: row.to_currency as CurrencyCode,
    buyRate: num(row.buy_rate),
    sellRate: num(row.sell_rate),
    rate: Number(row.rate),
    effectiveFrom: row.effective_from,
    effectiveTo: row.effective_to ?? null,
    status: row.status as RateStatus,
    createdByUserId: row.created_by_user_id,
    approvedByUserId: row.approved_by_user_id ?? null,
    approvedAt: row.approved_at ?? null,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}
