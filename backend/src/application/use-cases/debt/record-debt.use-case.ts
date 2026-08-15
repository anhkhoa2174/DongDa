// Use Case: Ghi nhận công nợ (tăng) — WU/MG gọi khi tạo giao dịch
// Layer: Application

import { Injectable, Inject } from '@nestjs/common';
import { IDebtRepository } from '../../../domain/repositories/debt.repository';
import { DebtMovement, CurrencyCode } from '../../../domain/entities/debt.entity';
import type { RecordDebtDto } from '../../dtos/debt/debt.dto';

@Injectable()
export class RecordDebtUseCase {
  constructor(
    @Inject('IDebtRepository') private readonly debtRepo: IDebtRepository,
  ) {}

  execute(dto: RecordDebtDto, createdByUserId: string): Promise<DebtMovement> {
    return this.debtRepo.recordDebt({
      branchId: dto.branchId,
      providerCode: dto.providerCode,
      currencyCode: dto.currencyCode as CurrencyCode,
      amount: dto.amount,
      businessDate: dto.businessDate ? new Date(dto.businessDate) : undefined,
      description: dto.description,
      sourceType: 'CUSTOMER_TRANSACTION',
      createdByUserId,
    });
  }
}
