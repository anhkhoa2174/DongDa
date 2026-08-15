// Use Cases: Ca làm việc (mở/đóng/hiện tại)
// Layer: Application

import { Injectable, Inject, NotFoundException, ConflictException } from '@nestjs/common';
import { IShiftRepository } from '../../../domain/repositories/shift.repository';
import { CurrencyCode } from '../../../domain/entities/shift.entity';
import type { OpenShiftDto, CloseShiftDto } from '../../dtos/shift/shift.dto';

@Injectable()
export class OpenShiftUseCase {
  constructor(@Inject('IShiftRepository') private readonly repo: IShiftRepository) {}
  async execute(dto: OpenShiftDto, userId: string) {
    // BR-F8.1: một chi nhánh chỉ 1 ca mở tại một thời điểm
    const current = await this.repo.findCurrent(dto.branchId);
    if (current) {
      throw new ConflictException('Chi nhánh đang có ca mở — đóng ca cũ trước khi mở ca mới');
    }
    return this.repo.openShift({
      branchId: dto.branchId,
      openedByUserId: userId,
      openingCounts: dto.openingCounts.map((c) => ({ currency: c.currency as CurrencyCode, actualAmount: c.actualAmount })),
      note: dto.note,
    });
  }
}

@Injectable()
export class CloseShiftUseCase {
  constructor(@Inject('IShiftRepository') private readonly repo: IShiftRepository) {}
  execute(shiftId: string, dto: CloseShiftDto, userId: string) {
    return this.repo.closeShift({
      shiftId,
      branchId: dto.branchId,
      closedByUserId: userId,
      closingCounts: dto.closingCounts.map((c) => ({ currency: c.currency as CurrencyCode, actualAmount: c.actualAmount })),
      note: dto.note,
    });
  }
}

@Injectable()
export class CurrentShiftUseCase {
  constructor(@Inject('IShiftRepository') private readonly repo: IShiftRepository) {}
  async execute(branchId: string) {
    const shift = await this.repo.findCurrent(branchId);
    if (!shift) return { shift: null, cashCounts: [] };
    return { shift, cashCounts: await this.repo.getCashCount(shift.id) };
  }
}
