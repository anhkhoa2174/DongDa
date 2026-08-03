// Use Cases: MoneyGram
// Layer: Application

import { Injectable, Inject, ConflictException, BadRequestException } from '@nestjs/common';
import { IMgRepository, ListMgFilter } from '../../../domain/repositories/mg.repository';
import { IExchangeRateRepository } from '../../../domain/repositories/exchange-rate.repository';
import { MgTransaction, Currency2 } from '../../../domain/entities/mg.entity';
import { ExchangeRateType, ServiceProvider } from '../../../domain/entities/exchange-rate.entity';
import type { CreateMgDto } from '../../dtos/mg/mg.dto';

@Injectable()
export class CreateMgUseCase {
  constructor(
    @Inject('IMgRepository') private readonly mgRepo: IMgRepository,
    @Inject('IExchangeRateRepository') private readonly rateRepo: IExchangeRateRepository,
  ) {}

  async execute(dto: CreateMgDto, createdByUserId: string): Promise<MgTransaction> {
    // BR-F4.5: 1 Reference Number chỉ xử lý một lần
    if (await this.mgRepo.referenceExists(dto.referenceNo)) {
      throw new ConflictException(`Reference Number ${dto.referenceNo} đã được xử lý`);
    }

    const rateType = dto.payoutCurrency === 'VND'
      ? ExchangeRateType.PAID_BUY
      : ExchangeRateType.PAID_SELL;
    const active = await this.rateRepo.findActive({
      rateType,
      provider: ServiceProvider.WU_MG,
      fromCurrency: 'USD',
    });
    const appliedRate = active[0]?.rate;
    if (!appliedRate) {
      throw new BadRequestException(`Chưa có tỷ giá ACTIVE ${rateType} cho MG/WU USD`);
    }
    assertMgPayoutMatches(dto.payoutCurrency, dto.payoutAmount, dto.receivedUsd, dto.receivedVnd, appliedRate);

    return this.mgRepo.create({
      branchId: dto.branchId,
      referenceNo: dto.referenceNo,
      customerName: dto.customerName,
      mgUsdAmount: dto.mgUsdAmount,
      mgVndAmount: dto.mgVndAmount,
      payoutCurrency: dto.payoutCurrency as Currency2,
      payoutAmount: dto.payoutAmount,
      receivedUsd: dto.receivedUsd,
      receivedVnd: dto.receivedVnd,
      appliedRate,
      systemRate: appliedRate,
      paidCurrency: dto.paidCurrency as Currency2,
      createdByUserId,
    });
  }
}

function assertMgPayoutMatches(
  payoutCurrency: string,
  payoutAmount: number,
  receivedUsd: number,
  receivedVnd: number,
  appliedRate: number,
) {
  if (Number(receivedUsd ?? 0) <= 0 && Number(receivedVnd ?? 0) <= 0) {
    throw new BadRequestException('Phải nhập số tiền thực trả cho khách');
  }

  if (payoutCurrency === 'VND') {
    if (Number(receivedUsd ?? 0) > 0 || Math.abs(Number(receivedVnd ?? 0) - payoutAmount) > 1) {
      throw new BadRequestException('MG VND: khách nhận VND thì số VND thực trả phải khớp số tiền MG');
    }
    return;
  }

  if (Number(receivedUsd ?? 0) > 0 && !Number.isInteger(Number(receivedUsd))) {
    throw new BadRequestException('MG USD: USD thực trả phải là số nguyên, phần lẻ quy đổi sang VND');
  }

  const actualUsdValue = Number(receivedUsd ?? 0) + (Number(receivedVnd ?? 0) / appliedRate);
  if (Math.abs(actualUsdValue - payoutAmount) > 0.01) {
    throw new BadRequestException(
      `MG USD: tổng tiền thực trả không khớp. Quy đổi thực trả ${actualUsdValue}, số phải trả ${payoutAmount}`,
    );
  }
}

@Injectable()
export class ListMgUseCase {
  constructor(@Inject('IMgRepository') private readonly mgRepo: IMgRepository) {}
  execute(filter?: ListMgFilter): Promise<MgTransaction[]> {
    return this.mgRepo.list(filter);
  }
}
