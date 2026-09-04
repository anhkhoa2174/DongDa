// Use Cases: Ngân hàng
// Layer: Application
//
// Mọi tài khoản đăng nhập được đọc danh sách và lịch sử ngân hàng toàn công ty.
// Quyền tạo tài khoản và ghi biến động vẫn được kiểm tra riêng theo role/chi nhánh.

import { Injectable, Inject, ForbiddenException, NotFoundException, BadRequestException } from '@nestjs/common';
import { IBankRepository } from '../../../domain/repositories/bank.repository';
import { Bank, BankAccount, BankMovement, CurrencyCode, InternalBankTransferResult } from '../../../domain/entities/bank.entity';
import { UserRole, GLOBAL_ROLES } from '../../../domain/entities/user.entity';
import type {
  CreateBankAccountDto, CreateBankMovementDto, CreateInternalBankTransferDto,
  ReceiveFromProviderDto, SettleAdvanceCkDto,
} from '../../dtos/bank/bank.dto';
import { toVietnamBusinessDate } from '../../../infrastructure/database/business-date';

export interface BankActor {
  id: string;
  role: UserRole;
  branchId?: string | null;
}

function scopeBranch(actor: BankActor, requested?: string): string | undefined {
  if (GLOBAL_ROLES.includes(actor.role)) return requested;
  if (!actor.branchId) throw new ForbiddenException('Tài khoản chi nhánh chưa được gán chi nhánh');
  return actor.branchId;
}

@Injectable()
export class ListBankUseCase {
  constructor(@Inject('IBankRepository') private readonly bankRepo: IBankRepository) {}
  banks(): Promise<Bank[]> {
    return this.bankRepo.listBanks();
  }
  accounts(_actor: BankActor, branchId?: string, includeInactive = false): Promise<BankAccount[]> {
    return this.bankRepo.listAccounts(branchId, includeInactive);
  }
  movements(_actor: BankActor, bankAccountId?: string): Promise<BankMovement[]> {
    return this.bankRepo.listMovements(bankAccountId);
  }
}

@Injectable()
export class ManageBankAccountUseCase {
  constructor(@Inject('IBankRepository') private readonly bankRepo: IBankRepository) {}

  create(dto: CreateBankAccountDto, actor: BankActor): Promise<BankAccount> {
    return this.bankRepo.createAccount({
      branchId: dto.branchId,
      bankCode: dto.bankCode.trim().toUpperCase(),
      bankName: dto.bankName?.trim() || undefined,
      accountNo: dto.accountNo.trim(),
      accountName: dto.accountName.trim(),
      currencyCode: dto.currencyCode as CurrencyCode,
      openingBalance: dto.openingBalance ?? 0,
      createdByUserId: actor.id,
    });
  }

  async deactivate(id: string): Promise<BankAccount> {
    return this.bankRepo.deactivateAccount(id);
  }
}

@Injectable()
export class RecordBankMovementUseCase {
  constructor(@Inject('IBankRepository') private readonly bankRepo: IBankRepository) {}

  async execute(
    bankAccountId: string,
    dto: CreateBankMovementDto,
    actor: BankActor,
    idempotencyKey: string,
  ): Promise<BankMovement> {
    const account = await this.bankRepo.findAccount(bankAccountId);
    if (!account) throw new NotFoundException('Không tìm thấy tài khoản ngân hàng');
    if (account.status !== 'ACTIVE') throw new BadRequestException('Tài khoản ngân hàng đã ngưng hoạt động');
    if (!GLOBAL_ROLES.includes(actor.role) && actor.branchId !== account.branchId) {
      throw new ForbiddenException('Chỉ được ghi biến động trên tài khoản ngân hàng của chi nhánh mình');
    }
    const isExternalTransfer = dto.movementType === 'TRANSFER_IN' || dto.movementType === 'TRANSFER_OUT';
    if (isExternalTransfer && !dto.description?.trim()) {
      throw new BadRequestException('Nội dung chuyển khoản không được để trống');
    }
    if (dto.movementType === 'TRANSFER_OUT' && !dto.counterparty?.trim()) {
      throw new BadRequestException('Chuyển khoản đi phải có người nhận hoặc số tài khoản');
    }
    return this.bankRepo.createMovement({
      idempotencyKey,
      bankAccountId,
      movementType: dto.movementType,
      amount: dto.amount,
      description: dto.description?.trim() || undefined,
      bankReference: dto.movementType === 'TRANSFER_OUT' ? dto.bankReference?.trim() || undefined : undefined,
      counterparty: dto.movementType === 'TRANSFER_OUT' ? dto.counterparty?.trim() || undefined : undefined,
      businessDate: dto.businessDate ? toVietnamBusinessDate(new Date(`${dto.businessDate}T00:00:00+07:00`)) : undefined,
      createdByUserId: actor.id,
    });
  }
}

@Injectable()
export class InternalBankTransferUseCase {
  constructor(@Inject('IBankRepository') private readonly bankRepo: IBankRepository) {}

  async execute(
    dto: CreateInternalBankTransferDto,
    actor: BankActor,
    idempotencyKey: string,
  ): Promise<InternalBankTransferResult> {
    if (dto.fromBankAccountId === dto.toBankAccountId) {
      throw new BadRequestException('Tài khoản nguồn và tài khoản đích phải khác nhau');
    }
    return this.bankRepo.transferInternal({
      idempotencyKey,
      fromBankAccountId: dto.fromBankAccountId,
      toBankAccountId: dto.toBankAccountId,
      amount: dto.amount,
      description: dto.description?.trim() || undefined,
      bankReference: dto.bankReference?.trim() || undefined,
      businessDate: dto.businessDate
        ? toVietnamBusinessDate(new Date(`${dto.businessDate}T00:00:00+07:00`))
        : undefined,
      createdByUserId: actor.id,
    });
  }
}

@Injectable()
export class ReceiveFromProviderUseCase {
  constructor(@Inject('IBankRepository') private readonly bankRepo: IBankRepository) {}
  execute(dto: ReceiveFromProviderDto, createdByUserId: string): Promise<BankMovement> {
    return this.bankRepo.receiveFromProvider({ ...dto, createdByUserId });
  }
}

@Injectable()
export class SettleAdvanceCkUseCase {
  constructor(@Inject('IBankRepository') private readonly bankRepo: IBankRepository) {}
  execute(
    advanceMovementId: string,
    dto: SettleAdvanceCkDto,
    settledByUserId: string,
    idempotencyKey: string,
  ): Promise<BankMovement> {
    if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(advanceMovementId)) {
      throw new BadRequestException('ID phiếu tạm ứng không hợp lệ');
    }
    if (dto.source === 'BANK_ACCOUNT' && !dto.sourceBankAccountId) {
      throw new BadRequestException('Hoàn bằng chuyển khoản nội bộ phải chọn tài khoản nguồn');
    }
    return this.bankRepo.settleAdvanceCk({
      idempotencyKey,
      advanceMovementId,
      source: dto.source,
      sourceBankAccountId: dto.sourceBankAccountId,
      note: dto.note?.trim() || undefined,
      settledByUserId,
    });
  }
}

@Injectable()
export class ListAdvancesUseCase {
  constructor(@Inject('IBankRepository') private readonly bankRepo: IBankRepository) {}
  list(actor: BankActor, filter: { bankAccountId?: string; branchId?: string; status?: 'ADVANCE_CK' | 'SETTLED' | 'VOIDED' }): Promise<BankMovement[]> {
    return this.bankRepo.listAdvances({ ...filter, branchId: scopeBranch(actor, filter.branchId) });
  }
}
