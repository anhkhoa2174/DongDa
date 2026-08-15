// Prisma ExchangeRate Repository Implementation
// Layer: Infrastructure

import { ConflictException, Injectable } from '@nestjs/common';
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
  RateIdentity,
} from '../../../domain/entities/exchange-rate.entity';

@Injectable()
export class PrismaExchangeRateRepository implements IExchangeRateRepository {
  constructor(private readonly prisma: PrismaService) {}

  async create(data: CreateExchangeRateData): Promise<ExchangeRate> {
    try {
      const row = await this.prisma.exchange_rates.create({
        data: {
          rate_type: data.rateType,
          provider: data.provider ?? null,
          from_currency: data.fromCurrency,
          to_currency: data.toCurrency,
          buy_rate: data.buyRate ?? null,
          sell_rate: data.sellRate ?? null,
          rate: data.rate,
          margin: data.margin,
          effective_from: data.effectiveFrom,
          status: 'DRAFT',
          created_by_user_id: data.createdByUserId,
        },
      });
      return toDomain(row);
    } catch (error) {
      rethrowDuplicateDraft(error);
    }
  }

  async createMany(items: CreateExchangeRateData[]): Promise<ExchangeRate[]> {
    try {
      return await this.prisma.$transaction(async (tx) => {
        const created = [];
        for (const data of items) {
          created.push(await tx.exchange_rates.create({ data: {
            rate_type: data.rateType, provider: data.provider ?? null,
            from_currency: data.fromCurrency, to_currency: data.toCurrency,
            buy_rate: data.buyRate ?? null, sell_rate: data.sellRate ?? null,
            rate: data.rate, margin: data.margin, effective_from: data.effectiveFrom,
            status: 'DRAFT', created_by_user_id: data.createdByUserId,
          }}));
        }
        return created.map(toDomain);
      });
    } catch (error) {
      rethrowDuplicateDraft(error);
    }
  }

  async findById(id: string): Promise<ExchangeRate | null> {
    const row = await this.prisma.exchange_rates.findUnique({ where: { id } });
    return row ? toDomain(row) : null;
  }

  async findDraftByIdentity(identity: RateIdentity): Promise<ExchangeRate | null> {
    const row = await this.prisma.exchange_rates.findFirst({
      where: {
        status: RateStatus.DRAFT,
        rate_type: identity.rateType,
        provider: identity.provider ?? null,
        from_currency: identity.fromCurrency,
        to_currency: identity.toCurrency,
      },
      orderBy: [{ created_at: 'desc' }, { id: 'desc' }],
    });
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
    const groupedRateTypes = filter.rateGroup ? rateTypesForGroup(filter.rateGroup) : undefined;
    const where: Prisma.exchange_ratesWhereInput = {
      ...(filter.status && { status: filter.status }),
      ...(filter.rateType
        ? { rate_type: filter.rateType }
        : groupedRateTypes && { rate_type: { in: groupedRateTypes } }),
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

    const rows = await this.prisma.exchange_rates.findMany({
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
    });

    const groups = new Map<string, ExchangeRateHistoryResult['items'][number]>();
    for (const row of rows) {
      const rate = {
        ...toDomain(row),
        createdByName: row.users_exchange_rates_created_by_user_idTousers.employees.full_name,
        approvedByName: row.users_exchange_rates_approved_by_user_idTousers?.employees.full_name ?? null,
      };
      const category = historyCategory(rate.rateType);
      if (!category) continue;
      const key = `${row.created_by_user_id}:${row.created_at.toISOString()}:${category}:${row.from_currency}:${row.to_currency}`;
      const group = groups.get(key) ?? {
        id: key,
        category,
        fromCurrency: rate.fromCurrency,
        toCurrency: rate.toCurrency,
        createdByName: rate.createdByName,
        createdByUserId: rate.createdByUserId,
        createdAt: rate.createdAt,
      };

      if (rate.rateType === ExchangeRateType.PAID_BUY || rate.rateType === ExchangeRateType.FX_BUY) group.buy = rate;
      else if (rate.rateType === ExchangeRateType.PAID_SELL || rate.rateType === ExchangeRateType.FX_SELL) group.sell = rate;
      else group.bank = rate;
      groups.set(key, group);
    }

    const groupedItems = [...groups.values()];
    const start = (filter.page - 1) * filter.pageSize;

    return {
      items: groupedItems.slice(start, start + filter.pageSize),
      total: groupedItems.length,
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
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`${target.rate_type}:${target.provider ?? ''}:${target.from_currency}:${target.to_currency}`}))`;
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

function rethrowDuplicateDraft(error: unknown): never {
  if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
    throw new ConflictException('Loại tỷ giá này đã có bản chờ duyệt hoặc đang hoạt động');
  }
  throw error;
}

function rateTypesForGroup(group: 'PAID' | 'FX' | 'BANK') {
  if (group === 'PAID') return [ExchangeRateType.PAID_BUY, ExchangeRateType.PAID_SELL];
  if (group === 'FX') return [ExchangeRateType.FX_BUY, ExchangeRateType.FX_SELL];
  return [ExchangeRateType.BANK_RATE];
}

function historyCategory(rateType: ExchangeRateType): 'PAID' | 'FX' | 'BANK' | null {
  if (rateType === ExchangeRateType.PAID_BUY || rateType === ExchangeRateType.PAID_SELL) return 'PAID';
  if (rateType === ExchangeRateType.FX_BUY || rateType === ExchangeRateType.FX_SELL) return 'FX';
  if (rateType === ExchangeRateType.BANK_RATE) return 'BANK';
  return null;
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
    margin: Number(row.margin ?? 0),
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
