// Use Case: Giải quyết công nợ (trả nợ, giảm) — Flow 2
// Layer: Application

import { Injectable, Inject, NotFoundException, BadRequestException } from '@nestjs/common';
import { IDebtRepository } from '../../../domain/repositories/debt.repository';
import { DebtMovement } from '../../../domain/entities/debt.entity';
import type { SettleDebtDto } from '../../dtos/debt/debt.dto';

@Injectable()
export class SettleDebtUseCase {
  constructor(
    @Inject('IDebtRepository') private readonly debtRepo: IDebtRepository,
  ) {}

  async execute(debtAccountId: string, dto: SettleDebtDto, createdByUserId: string): Promise<DebtMovement> {
    const summary = await this.debtRepo.getAccountSummary(debtAccountId);
    if (!summary) throw new NotFoundException('Không tìm thấy sổ công nợ');

    // Không cho trả vượt số còn nợ
    if (dto.amount > summary.outstanding) {
      throw new BadRequestException(
        `Số tiền trả (${dto.amount}) vượt số còn nợ (${summary.outstanding} ${summary.currencyCode})`,
      );
    }

    return this.debtRepo.settle({
      debtAccountId,
      amount: dto.amount,
      description: dto.description,
      createdByUserId,
    });
  }
}
