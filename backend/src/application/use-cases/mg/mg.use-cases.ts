// Use Cases: MoneyGram
// Layer: Application

import { Injectable, Inject, ConflictException } from '@nestjs/common';
import { IMgRepository, ListMgFilter } from '../../../domain/repositories/mg.repository';
import { IExchangeRateRepository } from '../../../domain/repositories/exchange-rate.repository';
import { MgTransaction, Currency2 } from '../../../domain/entities/mg.entity';
import { ExchangeRateType } from '../../../domain/entities/exchange-rate.entity';
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

    const active = await this.rateRepo.findActive({
      rateType: ExchangeRateType.MG_SYSTEM,
      fromCurrency: 'USD',
    });
    const systemRate = active[0]?.rate ?? dto.appliedRate;

    return this.mgRepo.create({
      branchId: dto.branchId,
      referenceNo: dto.referenceNo,
      customerName: dto.customerName,
      mgUsdAmount: dto.mgUsdAmount,
      mgVndAmount: dto.mgVndAmount,
      payoutCurrency: dto.payoutCurrency as Currency2,
      payoutAmount: dto.payoutAmount,
      appliedRate: dto.appliedRate,
      systemRate,
      paidCurrency: dto.paidCurrency as Currency2,
      createdByUserId,
    });
  }
}

@Injectable()
export class ListMgUseCase {
  constructor(@Inject('IMgRepository') private readonly mgRepo: IMgRepository) {}
  execute(filter?: ListMgFilter): Promise<MgTransaction[]> {
    return this.mgRepo.list(filter);
  }
}
