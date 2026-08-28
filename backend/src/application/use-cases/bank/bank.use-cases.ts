// Use Cases: Ngân hàng
// Layer: Application

import { Injectable, Inject } from '@nestjs/common';
import { IBankRepository } from '../../../domain/repositories/bank.repository';
import { BankAccount, BankMovement } from '../../../domain/entities/bank.entity';
import type { ReceiveFromProviderDto, RecordAdvanceCkDto, SettleAdvanceCkDto } from '../../dtos/bank/bank.dto';

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

// Updated: ghi nhận số CK hằng ngày để cuối ngày dùng Tài khoản chính thanh toán lại
@Injectable()
export class RecordAdvanceCkUseCase {
  constructor(@Inject('IBankRepository') private readonly bankRepo: IBankRepository) {}
  execute(dto: RecordAdvanceCkDto, createdByUserId: string): Promise<BankMovement> {
    return this.bankRepo.recordAdvanceCk({ ...dto, createdByUserId });
  }
}

// Hoàn lại tạm ứng CK cuối ngày
@Injectable()
export class SettleAdvanceCkUseCase {
  constructor(@Inject('IBankRepository') private readonly bankRepo: IBankRepository) {}
  execute(dto: SettleAdvanceCkDto, settledByUserId: string): Promise<BankMovement> {
    return this.bankRepo.settleAdvanceCk({ ...dto, settledByUserId });
  }
}

// Liệt kê tạm ứng CK (chưa hoàn hoặc tất cả)
@Injectable()
export class ListAdvancesUseCase {
  constructor(@Inject('IBankRepository') private readonly bankRepo: IBankRepository) {}
  list(filter?: { bankAccountId?: string; branchId?: string; businessDate?: Date; status?: 'ADVANCE_CK' | 'SETTLED' }): Promise<BankMovement[]> {
    return this.bankRepo.listAdvances(filter);
  }
}

