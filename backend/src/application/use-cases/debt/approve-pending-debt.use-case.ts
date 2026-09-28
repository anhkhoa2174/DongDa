// Use Case: Duyệt tay công nợ không đối chiếu được
// Layer: Application
//
// Công nợ chỉ tự sang RECONCILED khi giao dịch khớp Journal lúc chốt Final. Giao dịch lệch
// (thiếu trong Journal, lệch số tiền...) sẽ kẹt PENDING mãi — GĐ/KTTH duyệt tay (bắt buộc lý do)
// để công nợ đi tiếp vào luồng xử lý/tất toán như bình thường.

import { BadRequestException, Inject, Injectable } from '@nestjs/common';
import { IDebtRepository } from '../../../domain/repositories/debt.repository';
import type { DebtAccountSummary } from '../../../domain/entities/debt.entity';
import type { ApprovePendingDebtDto } from '../../dtos/debt/debt.dto';

@Injectable()
export class ApprovePendingDebtUseCase {
  constructor(@Inject('IDebtRepository') private readonly debtRepo: IDebtRepository) {}

  execute(debtAccountId: string, dto: ApprovePendingDebtDto, approvedByUserId: string): Promise<DebtAccountSummary> {
    const reason = dto.reason.trim();
    if (!reason) throw new BadRequestException('Vui lòng nhập lý do duyệt');
    return this.debtRepo.approvePending({ debtAccountId, reason, approvedByUserId });
  }
}
