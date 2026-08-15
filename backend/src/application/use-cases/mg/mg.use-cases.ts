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
    const mgUsdAmount = dto.paidCurrency === 'USD' ? Number(dto.mgUsdAmount) : 0;
    const mgVndAmount = dto.paidCurrency === 'VND' ? Number(dto.mgVndAmount) : 0;
    const expectedPayout = calculateMgPayout(dto.paidCurrency, dto.payoutCurrency, mgUsdAmount, mgVndAmount, appliedRate);
    if (Math.abs(Number(dto.payoutAmount) - expectedPayout) > (dto.payoutCurrency === 'VND' ? 1 : 0.01)) {
      throw new BadRequestException(`Số tiền MG phải trả phải là ${expectedPayout.toFixed(dto.payoutCurrency === 'VND' ? 0 : 2)} ${dto.payoutCurrency}`);
    }
    assertMgPayoutMatches(dto.payoutCurrency, expectedPayout, dto.receivedUsd, dto.receivedVnd, appliedRate);

    return this.mgRepo.create({
      branchId: dto.branchId,
      referenceNo: dto.referenceNo,
      customerName: dto.customerName,
      mgUsdAmount,
      mgVndAmount,
      payoutCurrency: dto.payoutCurrency as Currency2,
      payoutAmount: expectedPayout,
      receivedUsd: dto.receivedUsd,
      receivedVnd: dto.receivedVnd,
      appliedRate,
      systemRate: appliedRate,
      paidCurrency: dto.paidCurrency as Currency2,
      createdByUserId,
    });
  }
}

export function calculateMgPayout(
  paidCurrency: string, payoutCurrency: string, mgUsdAmount: number, mgVndAmount: number, rate: number,
) {
  const payout = payoutCurrency === 'USD'
    ? (paidCurrency === 'USD' ? mgUsdAmount : mgVndAmount / rate)
    : (paidCurrency === 'VND' ? mgVndAmount : mgUsdAmount * rate);
  return payoutCurrency === 'VND' ? Math.round(payout) : Number(payout.toFixed(2));
}

export function assertMgPayoutMatches(
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

  const expectedUsd = Math.trunc(Math.max(payoutAmount, 0));
  const fractionalUsd = Math.max(payoutAmount - expectedUsd, 0);
  const expectedVnd = Math.round(fractionalUsd * appliedRate);
  if (Number(receivedUsd ?? 0) !== expectedUsd) {
    throw new BadRequestException(`MG USD: USD thực trả phải là phần nguyên của số phải trả (${expectedUsd} USD)`);
  }
  if (Math.abs(Number(receivedVnd ?? 0) - expectedVnd) > 1) {
    throw new BadRequestException(
      `MG USD: VND thực trả chỉ được là phần lẻ USD quy đổi theo tỷ giá (${expectedVnd} VND)`,
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
