// Use Case: Duyệt tỷ giá — set ACTIVE + supersede bản active cũ (BR-F2.3)
// Layer: Application

import { Injectable, Inject, NotFoundException, ConflictException } from '@nestjs/common';
import { IExchangeRateRepository } from '../../../domain/repositories/exchange-rate.repository';
import { ExchangeRate, canApprove } from '../../../domain/entities/exchange-rate.entity';

@Injectable()
export class ApproveExchangeRateUseCase {
  constructor(
    @Inject('IExchangeRateRepository')
    private readonly rateRepo: IExchangeRateRepository,
  ) {}

  async execute(id: string, approverUserId: string): Promise<ExchangeRate> {
    const rate = await this.rateRepo.findById(id);
    if (!rate) throw new NotFoundException('Không tìm thấy tỷ giá');

    if (!canApprove(rate)) {
      throw new ConflictException(
        `Chỉ duyệt được tỷ giá đang ở trạng thái DRAFT (hiện tại: ${rate.status})`,
      );
    }

    // Repository lo transaction: supersede bản ACTIVE cùng identity → set bản này ACTIVE
    return this.rateRepo.approveAndSupersede(id, approverUserId);
  }
}
