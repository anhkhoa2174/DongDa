// Use Case: Heartbeat
// Layer: Application
// Dependency: IAuthSessionRepository (injected qua token — không import NestJS/ConfigService trực tiếp)
//
// Client của Staff gọi định kỳ để giữ session sống. Nếu quá lâu không có heartbeat
// (idle timeout), session bị auto-revoke để trả lại slot chi nhánh.

import { Injectable, Inject, NotFoundException, UnauthorizedException } from '@nestjs/common';
import type { IAuthSessionRepository } from '../../../domain/repositories/auth-session.repository';

export interface HeartbeatResult {
  sessionId: string;
  isStale: boolean;
  expiresAt: Date;
}

@Injectable()
export class HeartbeatUseCase {
  constructor(
    @Inject('IAuthSessionRepository') private readonly authSessionRepo: IAuthSessionRepository,
    @Inject('AUTH_SESSION_HEARTBEAT_TIMEOUT_SEC') private readonly heartbeatTimeoutSec: number,
  ) {}

  async execute(sessionId: string): Promise<HeartbeatResult> {
    // Không gọi revokeExpiredSessions() ở đây: SessionCleanupService đã chạy đúng
    // việc dọn này bằng cron mỗi 60s, độc lập với hoạt động của user. Gọi thêm mỗi
    // request heartbeat (≈2 phút/user) chỉ là write amplification, không thêm tính đúng.
    const session = await this.authSessionRepo.findById(sessionId);
    if (!session) throw new NotFoundException('Không tìm thấy phiên đăng nhập');

    if (session.isExpired()) {
      throw new UnauthorizedException('Phiên đăng nhập đã hết hạn hoặc bị thu hồi');
    }

    if (session.isHeartbeatStale(this.heartbeatTimeoutSec)) {
      await this.authSessionRepo.revokeById(sessionId);
      throw new UnauthorizedException('Phiên đăng nhập đã hết thời gian chờ do không hoạt động');
    }

    const updated = await this.authSessionRepo.updateHeartbeat(sessionId);
    if (!updated) throw new NotFoundException('Không tìm thấy phiên đăng nhập');

    return {
      sessionId: updated.id,
      isStale: false,
      expiresAt: updated.expiresAt,
    };
  }
}
