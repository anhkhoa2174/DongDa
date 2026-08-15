// Use Cases: Tiếp quỹ — Flow 3
// Layer: Application
//   Create (Pending) → Confirm (post ledger, số dư chuyển) / Reject
//   + xem số dư quỹ

import { BadRequestException, ForbiddenException, Injectable, Inject, NotFoundException } from '@nestjs/common';
import {
  IFundRepository, ListFundMovementHistoryFilter, ListTransfersFilter,
} from '../../../domain/repositories/fund.repository';
import {
  FundTransfer, FundAccountBalance, CurrencyCode, CentralFundSummary, CentralFundMovement,
  FundMovementHistoryItem, CentralFundConversion,
} from '../../../domain/entities/fund.entity';
import type { ConvertCentralFundDto, CreateCentralFundMovementDto, CreateTransferDto } from '../../dtos/fund/fund.dto';
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
  async execute(id: string, actor: { id: string; role: UserRole; branchId?: string }): Promise<FundTransfer> {
    const t = await this.fundRepo.findTransferById(id);
    if (!t) throw new NotFoundException('Không tìm thấy phiếu tiếp quỹ');
    assertReceiverCanAct(t, actor);
    return this.fundRepo.confirmTransfer(id, actor.id);
  }
}

@Injectable()
export class RejectTransferUseCase {
  constructor(@Inject('IFundRepository') private readonly fundRepo: IFundRepository) {}
  async execute(id: string, actor: { id: string; role: UserRole; branchId?: string }): Promise<FundTransfer> {
    const t = await this.fundRepo.findTransferById(id);
    if (!t) throw new NotFoundException('Không tìm thấy phiếu tiếp quỹ');
    assertReceiverCanAct(t, actor);
    return this.fundRepo.rejectTransfer(id, actor.id);
  }
}

@Injectable()
export class CancelTransferUseCase {
  constructor(@Inject('IFundRepository') private readonly fundRepo: IFundRepository) {}

  async execute(id: string, actor: { id: string }): Promise<FundTransfer> {
    const transfer = await this.fundRepo.findTransferById(id);
    if (!transfer) throw new NotFoundException('Không tìm thấy phiếu tiếp quỹ');
    if (transfer.createdByUserId !== actor.id) {
      throw new ForbiddenException('Chỉ người lập phiếu mới được hủy phiếu tiếp quỹ');
    }
    return this.fundRepo.cancelTransfer(id, actor.id);
  }
}

function assertReceiverCanAct(
  transfer: FundTransfer,
  actor: { id: string; role: UserRole; branchId?: string },
) {
  if (transfer.createdByUserId === actor.id) {
    throw new ForbiddenException('Người lập phiếu không được tự xác nhận hoặc từ chối phiếu tiếp quỹ');
  }
  if (actor.role === UserRole.STAFF && actor.branchId !== transfer.destinationBranchId) {
    throw new ForbiddenException('Nhân viên chỉ được xử lý phiếu gửi đến chi nhánh mình');
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
  movementHistory(filter?: ListFundMovementHistoryFilter): Promise<FundMovementHistoryItem[]> {
    return this.fundRepo.listMovementHistory(filter);
  }
}

@Injectable()
export class CreateFundMovementUseCase {
  constructor(@Inject('IFundRepository') private readonly fundRepo: IFundRepository) {}

  execute(dto: CreateCentralFundMovementDto, userId: string, targetBranchId?: string): Promise<CentralFundMovement> {
    if (targetBranchId && dto.sourceType !== 'CASH') {
      throw new BadRequestException('Quỹ Chi Nhánh chỉ cho phép thu/chi từ nguồn tiền mặt');
    }
    return this.fundRepo.createFundMovement({
      direction: dto.direction,
      sourceType: dto.sourceType,
      items: dto.items.map((item) => ({
        currencyCode: item.currencyCode as CurrencyCode,
        amount: item.amount,
        bankAccountId: item.bankAccountId,
      })),
      note: dto.note?.trim() || undefined,
      createdByUserId: userId,
      targetBranchId,
    });
  }
}

@Injectable()
export class ConvertCentralFundUseCase {
  constructor(@Inject('IFundRepository') private readonly fundRepo: IFundRepository) {}

  execute(dto: ConvertCentralFundDto, userId: string): Promise<CentralFundConversion> {
    return this.fundRepo.convertCentralFund({
      items: dto.items.map((item) => ({
        currencyCode: item.currencyCode as CurrencyCode,
        amount: item.amount,
      })),
      note: dto.note?.trim() || undefined,
      createdByUserId: userId,
    });
  }
}
