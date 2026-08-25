// Use Case: Duyệt tỷ giá — set ACTIVE + supersede bản active cũ (BR-F2.3)
// Layer: Application

import { Injectable, Inject, NotFoundException, ConflictException } from '@nestjs/common';
import { IExchangeRateRepository } from '../../../domain/repositories/exchange-rate.repository';
import { ExchangeRate, canApprove, counterpartRateType } from '../../../domain/entities/exchange-rate.entity';

@Injectable()
export class ApproveExchangeRateUseCase {
  constructor(
    @Inject('IExchangeRateRepository')
    private readonly rateRepo: IExchangeRateRepository,
  ) {}

  async execute(id: string, approverUserId: string): Promise<ExchangeRate> {
    const approved = await this.executeMany([id], approverUserId);
    return approved.find((rate) => rate.id === id) ?? approved[0];
  }

  async executeMany(ids: string[], approverUserId: string): Promise<ExchangeRate[]> {
    const rates = await this.expandPairs(ids);
    return this.rateRepo.approveAndSupersedeMany(rates.map((rate) => rate.id), approverUserId);
  }

  private async expandPairs(ids: string[]) {
    const selected = await Promise.all([...new Set(ids)].map(async (id) => {
      const rate = await this.rateRepo.findById(id);
      if (!rate) throw new NotFoundException(`Không tìm thấy tỷ giá ${id}`);
      this.assertDraft(rate);
      return rate;
    }));
    const expanded = new Map(selected.map((rate) => [rate.id, rate]));

    for (const rate of selected) {
      const counterpartType = counterpartRateType(rate.rateType);
      if (!counterpartType) continue;
      const counterpart = await this.rateRepo.findDraftByIdentity({
        rateType: counterpartType,
        provider: rate.provider,
        fromCurrency: rate.fromCurrency,
        toCurrency: rate.toCurrency,
      });
      if (!counterpart) {
        throw new ConflictException(`Cặp ${rate.fromCurrency}/${rate.toCurrency} thiếu tỷ giá ${counterpartType.includes('BUY') ? 'mua' : 'bán'} DRAFT`);
      }
      this.assertDraft(counterpart);
      expanded.set(counterpart.id, counterpart);
    }
    return [...expanded.values()];
  }

  private assertDraft(rate: ExchangeRate) {
    if (!canApprove(rate)) {
      throw new ConflictException(
        `Chỉ duyệt được tỷ giá đang ở trạng thái DRAFT (hiện tại: ${rate.status})`,
      );
    }
  }
}
