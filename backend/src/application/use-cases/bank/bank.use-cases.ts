// Use Cases: Ngân hàng
// Layer: Application
//
// Mỗi chi nhánh có tài khoản ngân hàng riêng. STAFF chỉ thấy/ghi biến động trên tài khoản
// của chi nhánh mình (kiểm tra bằng canAccessBranch ở đây, không tin frontend).
// ADMIN/MANAGER (GĐ/KTTH) tạo tài khoản, ghi biến động ở mọi chi nhánh.

import { Injectable, Inject, ForbiddenException, NotFoundException, BadRequestException } from '@nestjs/common';
import { IBankRepository } from '../../../domain/repositories/bank.repository';
import { Bank, BankAccount, BankMovement, CurrencyCode } from '../../../domain/entities/bank.entity';
import { UserRole, GLOBAL_ROLES } from '../../../domain/entities/user.entity';
import type { CreateBankAccountDto, CreateBankMovementDto, ReceiveFromProviderDto } from '../../dtos/bank/bank.dto';
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
  accounts(actor: BankActor, branchId?: string, includeInactive = false): Promise<BankAccount[]> {
    return this.bankRepo.listAccounts(scopeBranch(actor, branchId), includeInactive);
  }
  movements(actor: BankActor, bankAccountId?: string): Promise<BankMovement[]> {
    return this.bankRepo.listMovements(bankAccountId, scopeBranch(actor));
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
    const account = await this.bankRepo.findAccount(id);
    if (!account) throw new NotFoundException('Không tìm thấy tài khoản ngân hàng');
    if (account.currentBalance !== 0) {
      throw new BadRequestException('Chỉ được ngưng tài khoản khi số dư bằng 0. Hãy chuyển hết số dư trước.');
    }
    return this.bankRepo.deactivateAccount(id);
  }
}

@Injectable()
export class RecordBankMovementUseCase {
  constructor(@Inject('IBankRepository') private readonly bankRepo: IBankRepository) {}

  async execute(bankAccountId: string, dto: CreateBankMovementDto, actor: BankActor): Promise<BankMovement> {
    const account = await this.bankRepo.findAccount(bankAccountId);
    if (!account) throw new NotFoundException('Không tìm thấy tài khoản ngân hàng');
    if (account.status !== 'ACTIVE') throw new BadRequestException('Tài khoản ngân hàng đã ngưng hoạt động');
    if (!GLOBAL_ROLES.includes(actor.role) && actor.branchId !== account.branchId) {
      throw new ForbiddenException('Chỉ được ghi biến động trên tài khoản ngân hàng của chi nhánh mình');
    }
    return this.bankRepo.createMovement({
      bankAccountId,
      movementType: dto.movementType,
      amount: dto.amount,
      description: dto.description?.trim() || undefined,
      bankReference: dto.bankReference?.trim() || undefined,
      counterparty: dto.counterparty?.trim() || undefined,
      businessDate: dto.businessDate ? toVietnamBusinessDate(new Date(`${dto.businessDate}T00:00:00+07:00`)) : undefined,
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
