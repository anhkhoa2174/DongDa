// Use Case: ForceLogoutStaff
// Layer: Application
//
// Cho phép MANAGER (KTTH) hoặc ADMIN (GĐ) cưỡng chế đăng xuất một phiên đăng
// nhập bị kẹt/bỏ dở, giải phóng ngay slot đăng nhập của chi nhánh thay vì chờ
// hết hạn heartbeat.

import { Injectable, Inject, ForbiddenException, NotFoundException } from '@nestjs/common';
import type { IAuthSessionRepository } from '../../../domain/repositories/auth-session.repository';
import type { IUserRepository } from '../../../domain/repositories/user.repository';
import { UserRole } from '../../../domain/entities/user.entity';

export interface ForceLogoutResult {
  revokedSessionId: string;
  userId: string;
  branchId: string | null;
}

@Injectable()
export class ForceLogoutStaffUseCase {
  constructor(
    @Inject('IAuthSessionRepository') private readonly authSessionRepo: IAuthSessionRepository,
    @Inject('IUserRepository') private readonly userRepo: IUserRepository,
  ) {}

  async execute(requesterUserId: string, targetSessionId: string): Promise<ForceLogoutResult> {
    const requester = await this.userRepo.findById(requesterUserId);
    if (!requester) throw new NotFoundException('Không tìm thấy người dùng');

    if (requester.role !== UserRole.ADMIN && requester.role !== UserRole.MANAGER) {
      throw new ForbiddenException('Chỉ GĐ/KTTH mới có quyền cưỡng chế đăng xuất nhân viên');
    }

    const targetSession = await this.authSessionRepo.findById(targetSessionId);
    if (!targetSession) throw new NotFoundException('Không tìm thấy phiên đăng nhập');

    // MANAGER gắn 1 chi nhánh cụ thể chỉ được cưỡng chế trong chi nhánh mình.
    // MANAGER không có branchId (KTTH cấp Hội sở) coi như có phạm vi toàn hệ thống.
    if (requester.role === UserRole.MANAGER && requester.branchId) {
      if (targetSession.branchId !== requester.branchId) {
        throw new ForbiddenException('Không thể cưỡng chế đăng xuất nhân viên ngoài chi nhánh của mình');
      }
    }

    await this.authSessionRepo.revokeById(targetSessionId);

    return {
      revokedSessionId: targetSessionId,
      userId: targetSession.userId,
      branchId: targetSession.branchId,
    };
  }
}
