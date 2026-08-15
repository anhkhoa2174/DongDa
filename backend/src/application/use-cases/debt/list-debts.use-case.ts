// Use Case: Xem công nợ (danh sách sổ + lịch sử biến động)
// Layer: Application

import { Injectable, Inject, NotFoundException } from '@nestjs/common';
import {
  IDebtRepository, ListDebtsFilter,
} from '../../../domain/repositories/debt.repository';
import { DebtAccountSummary, DebtMovement } from '../../../domain/entities/debt.entity';

@Injectable()
export class ListDebtsUseCase {
  constructor(
    @Inject('IDebtRepository') private readonly debtRepo: IDebtRepository,
  ) {}

  list(filter?: ListDebtsFilter): Promise<DebtAccountSummary[]> {
    return this.debtRepo.listAccountSummaries(filter);
  }

  async movements(accountId: string): Promise<DebtMovement[]> {
    const acc = await this.debtRepo.findAccountById(accountId);
    if (!acc) throw new NotFoundException('Không tìm thấy sổ công nợ');
    return this.debtRepo.listMovements(accountId);
  }
}
