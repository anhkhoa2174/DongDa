// Use Cases: Ngân hàng
// Layer: Application

import { Injectable, Inject } from '@nestjs/common';
import { IBankRepository } from '../../../domain/repositories/bank.repository';
import { BankAccount, BankMovement } from '../../../domain/entities/bank.entity';
import type { ReceiveFromProviderDto } from '../../dtos/bank/bank.dto';

@Injectable()
export class ListBankUseCase {
  constructor(@Inject('IBankRepository') private readonly bankRepo: IBankRepository) {}
  accounts(branchId?: string): Promise<BankAccount[]> {
    return this.bankRepo.listAccounts(branchId);
  }
  movements(bankAccountId?: string, branchId?: string): Promise<BankMovement[]> {
    return this.bankRepo.listMovements(bankAccountId, branchId);
  }
}

@Injectable()
export class ReceiveFromProviderUseCase {
  constructor(@Inject('IBankRepository') private readonly bankRepo: IBankRepository) {}
  execute(dto: ReceiveFromProviderDto, createdByUserId: string): Promise<BankMovement> {
    return this.bankRepo.receiveFromProvider({ ...dto, createdByUserId });
  }
}
