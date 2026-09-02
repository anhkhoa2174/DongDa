import { BadRequestException, Inject, Injectable } from '@nestjs/common';
import type { DomesticTransferTransaction } from '../../../domain/entities/domestic-transfer.entity';
import type {
  DomesticTransferBankAccount,
  IDomesticTransferRepository,
  ListDomesticTransferFilter,
} from '../../../domain/repositories/domestic-transfer.repository';
import type { CreateDomesticTransferDto } from '../../dtos/domestic-transfer/domestic-transfer.dto';

@Injectable()
export class CreateDomesticTransferUseCase {
  constructor(
    @Inject('IDomesticTransferRepository') private readonly repository: IDomesticTransferRepository,
  ) {}

  execute(
    dto: CreateDomesticTransferDto,
    createdByUserId: string,
    idempotencyKey: string,
  ): Promise<DomesticTransferTransaction> {
    if (dto.fee >= dto.amount && dto.fee > 0) {
      throw new BadRequestException('Phí phải nhỏ hơn số tiền giao dịch');
    }
    return this.repository.create({
      ...dto,
      fee: Number(dto.fee ?? 0),
      createdByUserId,
      idempotencyKey,
    });
  }
}

@Injectable()
export class ListDomesticTransferUseCase {
  constructor(
    @Inject('IDomesticTransferRepository') private readonly repository: IDomesticTransferRepository,
  ) {}

  execute(filter?: ListDomesticTransferFilter): Promise<DomesticTransferTransaction[]> {
    return this.repository.list(filter);
  }
}

@Injectable()
export class ListDomesticTransferBankAccountsUseCase {
  constructor(
    @Inject('IDomesticTransferRepository') private readonly repository: IDomesticTransferRepository,
  ) {}

  execute(): Promise<DomesticTransferBankAccount[]> {
    return this.repository.listBankAccounts();
  }
}
