// Use Case: Từ chối tỷ giá (DRAFT → REJECTED)
// Layer: Application

import { Injectable, Inject, NotFoundException, ConflictException } from '@nestjs/common';
import { IExchangeRateRepository } from '../../../domain/repositories/exchange-rate.repository';
import { ExchangeRate, canApprove } from '../../../domain/entities/exchange-rate.entity';

@Injectable()
export class RejectExchangeRateUseCase {
  constructor(
    @Inject('IExchangeRateRepository')
    private readonly rateRepo: IExchangeRateRepository,
  ) {}

  async execute(id: string): Promise<ExchangeRate> {
    const rejected = await this.executeMany([id]);
    return rejected.find((rate) => rate.id === id) ?? rejected[0];
  }

  async executeMany(ids: string[]): Promise<ExchangeRate[]> {
    const rates = await Promise.all([...new Set(ids)].map(async (id) => {
      const rate = await this.rateRepo.findById(id);
      if (!rate) throw new NotFoundException(`Không tìm thấy tỷ giá ${id}`);
      this.assertDraft(rate);
      return rate;
    }));
    return this.rateRepo.rejectMany(rates.map((rate) => rate.id));
  }

  private assertDraft(rate: ExchangeRate) {
    if (!canApprove(rate)) {
      throw new ConflictException(
        `Chỉ từ chối được tỷ giá đang DRAFT (hiện tại: ${rate.status})`,
      );
    }
  }
}
