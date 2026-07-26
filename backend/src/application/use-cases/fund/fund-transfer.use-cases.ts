// Use Cases: Điều chuyển vốn (Tiếp quỹ) — Flow 3
// Layer: Application
//   Create (Pending) → Confirm (post ledger, số dư chuyển) / Reject
//   + xem số dư quỹ

import { Injectable, Inject, NotFoundException } from '@nestjs/common';
import {
  IFundRepository, ListTransfersFilter,
} from '../../../domain/repositories/fund.repository';
import {
  FundTransfer, FundAccountBalance, CurrencyCode,
} from '../../../domain/entities/fund.entity';
import type { CreateTransferDto } from '../../dtos/fund/fund.dto';

@Injectable()
export class CreateTransferUseCase {
  constructor(@Inject('IFundRepository') private readonly fundRepo: IFundRepository) {}
  execute(dto: CreateTransferDto, createdByUserId: string): Promise<FundTransfer> {
    return this.fundRepo.createTransfer({
      sourceBranchId: dto.sourceBranchId,
      destinationBranchId: dto.destinationBranchId,
      currencyCode: dto.currencyCode as CurrencyCode,
      amount: dto.amount,
      createdByUserId,
    });
  }
}

@Injectable()
export class ConfirmTransferUseCase {
  constructor(@Inject('IFundRepository') private readonly fundRepo: IFundRepository) {}
  async execute(id: string, userId: string): Promise<FundTransfer> {
    const t = await this.fundRepo.findTransferById(id);
    if (!t) throw new NotFoundException('Không tìm thấy phiếu điều chuyển');
    return this.fundRepo.confirmTransfer(id, userId);
  }
}

@Injectable()
export class RejectTransferUseCase {
  constructor(@Inject('IFundRepository') private readonly fundRepo: IFundRepository) {}
  async execute(id: string, userId: string): Promise<FundTransfer> {
    const t = await this.fundRepo.findTransferById(id);
    if (!t) throw new NotFoundException('Không tìm thấy phiếu điều chuyển');
    return this.fundRepo.rejectTransfer(id, userId);
  }
}

@Injectable()
export class ListFundUseCase {
  constructor(@Inject('IFundRepository') private readonly fundRepo: IFundRepository) {}
  transfers(filter?: ListTransfersFilter): Promise<FundTransfer[]> {
    return this.fundRepo.listTransfers(filter);
  }
  balances(branchId?: string): Promise<FundAccountBalance[]> {
    return this.fundRepo.listBalances(branchId);
  }
}
