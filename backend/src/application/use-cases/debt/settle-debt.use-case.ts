// Use Case: Giải quyết công nợ (trả nợ, giảm) — Flow 2
// Layer: Application

import { Injectable, Inject, NotFoundException, BadRequestException } from '@nestjs/common';
import { IDebtRepository } from '../../../domain/repositories/debt.repository';
import { DebtMovement } from '../../../domain/entities/debt.entity';
import { DebtStatus } from '../../../domain/entities/debt.entity';
import type { DebtBatchSettlementResult } from '../../../domain/repositories/debt.repository';
import type { SettleUsdCashDebtDto } from '../../dtos/debt/debt.dto';
import type { SettleVndCashDebtDto } from '../../dtos/debt/debt.dto';
import type { SettleDebtBatchDto } from '../../dtos/debt/debt.dto';

@Injectable()
export class SettleUsdCashDebtUseCase {
  constructor(
    @Inject('IDebtRepository') private readonly debtRepo: IDebtRepository,
  ) {}

  async execute(debtAccountId: string, dto: SettleUsdCashDebtDto, createdByUserId: string): Promise<DebtMovement> {
    const summary = await this.debtRepo.getAccountSummary(debtAccountId);
    if (!summary) throw new NotFoundException('Không tìm thấy khoản công nợ');
    if (summary.currencyCode !== 'USD') {
      throw new BadRequestException('Form tiền mặt USD chỉ áp dụng cho công nợ USD');
    }
    if (summary.status !== DebtStatus.RECONCILED) {
      throw new BadRequestException('Công nợ chưa hoàn tất đối chiếu tổng');
    }
    const settlementAmount = Number((dto.cashUsdAmount + dto.oddUsdAmount).toFixed(2));
    if (settlementAmount <= 0) {
      throw new BadRequestException('Số tiền xử lý phải lớn hơn 0');
    }
    if (Math.abs(settlementAmount - summary.outstanding) >= 0.005) {
      throw new BadRequestException(
        `Phải tất toán toàn bộ ${summary.outstanding} USD`,
      );
    }
    return this.debtRepo.settleUsdCash({
      debtAccountId,
      cashUsdAmount: dto.cashUsdAmount,
      oddUsdAmount: dto.oddUsdAmount,
      description: dto.description,
      createdByUserId,
    });
  }
}

@Injectable()
export class SettleVndCashDebtUseCase {
  constructor(
    @Inject('IDebtRepository') private readonly debtRepo: IDebtRepository,
  ) {}

  async execute(debtAccountId: string, dto: SettleVndCashDebtDto, createdByUserId: string): Promise<DebtMovement> {
    const summary = await this.debtRepo.getAccountSummary(debtAccountId);
    if (!summary) throw new NotFoundException('Không tìm thấy khoản công nợ');
    if (summary.currencyCode !== 'VND') {
      throw new BadRequestException('Form tiền mặt VND chỉ áp dụng cho công nợ VND');
    }
    if (summary.status !== DebtStatus.RECONCILED) {
      throw new BadRequestException('Công nợ chưa hoàn tất đối chiếu tổng');
    }
    if (Math.abs(dto.amount - summary.outstanding) >= 0.005) {
      throw new BadRequestException(
        `Phải tất toán toàn bộ ${summary.outstanding} VND`,
      );
    }
    return this.debtRepo.settleVndCash({
      debtAccountId,
      amount: dto.amount,
      description: dto.description,
      createdByUserId,
    });
  }
}

@Injectable()
export class SettleDebtBatchUseCase {
  constructor(
    @Inject('IDebtRepository') private readonly debtRepo: IDebtRepository,
  ) {}

  execute(dto: SettleDebtBatchDto, createdByUserId: string): Promise<DebtBatchSettlementResult> {
    if (dto.settlementSource === 'BANK' && !dto.bankAccountId) {
      throw new BadRequestException('Phải chọn tài khoản ngân hàng nhận tiền');
    }
    return this.debtRepo.settleBatch({ ...dto, createdByUserId });
  }
}
