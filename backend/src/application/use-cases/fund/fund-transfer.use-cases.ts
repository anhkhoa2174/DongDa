// Use Cases: Tiếp quỹ — Flow 3
// Layer: Application
//   Create (Pending) → Confirm (post ledger, số dư chuyển) / Reject
//   + xem số dư quỹ

import { BadRequestException, Injectable, Inject, NotFoundException } from '@nestjs/common';
import {
  IFundRepository, ListTransfersFilter,
} from '../../../domain/repositories/fund.repository';
import {
  FundTransfer, FundAccountBalance, CurrencyCode, CentralFundSummary,
} from '../../../domain/entities/fund.entity';
import type { CreateTransferDto } from '../../dtos/fund/fund.dto';
import { UserRole } from '../../../domain/entities/user.entity';

@Injectable()
export class CreateTransferUseCase {
  constructor(@Inject('IFundRepository') private readonly fundRepo: IFundRepository) {}
  async execute(
    dto: CreateTransferDto,
    actor: { id: string; role: UserRole; branchId?: string },
  ): Promise<FundTransfer> {
    const sourceBranchId = actor.role === UserRole.STAFF
      ? actor.branchId
      : await this.fundRepo.findHeadOfficeBranchId();
    if (!sourceBranchId) {
      throw new BadRequestException(actor.role === UserRole.STAFF
        ? 'Tài khoản nhân viên chưa được gán chi nhánh'
        : 'Chưa cấu hình chi nhánh Hội sở (HO)');
    }

    return this.fundRepo.createTransfer({
      sourceBranchId,
      destinationBranchId: dto.destinationBranchId,
      items: dto.items.map((item) => ({
        currencyCode: item.currencyCode as CurrencyCode,
        amount: item.amount,
      })),
      createdByUserId: actor.id,
    });
  }
}

@Injectable()
export class ConfirmTransferUseCase {
  constructor(@Inject('IFundRepository') private readonly fundRepo: IFundRepository) {}
  async execute(id: string, userId: string): Promise<FundTransfer> {
    const t = await this.fundRepo.findTransferById(id);
    if (!t) throw new NotFoundException('Không tìm thấy phiếu tiếp quỹ');
    return this.fundRepo.confirmTransfer(id, userId);
  }
}

@Injectable()
export class RejectTransferUseCase {
  constructor(@Inject('IFundRepository') private readonly fundRepo: IFundRepository) {}
  async execute(id: string, userId: string): Promise<FundTransfer> {
    const t = await this.fundRepo.findTransferById(id);
    if (!t) throw new NotFoundException('Không tìm thấy phiếu tiếp quỹ');
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
  centralSummary(): Promise<CentralFundSummary> {
    return this.fundRepo.getCentralSummary();
  }
}
