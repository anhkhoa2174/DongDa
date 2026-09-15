// Cron dọn phiên đăng nhập hết hạn/mất kết nối — giải phóng slot đăng nhập của chi nhánh
// (khoá "chỉ 1 Staff / chi nhánh") ngay cả khi client không bao giờ gọi lại heartbeat/logout
// (đóng laptop, sập tab trình duyệt...). revokeExpiredSessions() chỉ bắt trần tuyệt đối 12h
// (Task 4), không bắt được phiên "mất kết nối" (không heartbeat) trước khi hết 12h — nên cron
// này gọi thêm revokeStaleHeartbeatSessions() mỗi phút.
// Layer: Infrastructure

import { Injectable, Logger, Inject } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { ConfigService } from '@nestjs/config';
import type { IAuthSessionRepository } from '../../domain/repositories/auth-session.repository';

@Injectable()
export class SessionCleanupService {
  private readonly logger = new Logger(SessionCleanupService.name);
  private readonly heartbeatTimeoutSec: number;

  constructor(
    @Inject('IAuthSessionRepository') private readonly authSessionRepo: IAuthSessionRepository,
    private readonly configService: ConfigService,
  ) {
    const raw = this.configService.get<string>('AUTH_SESSION_HEARTBEAT_TIMEOUT_SEC');
    this.heartbeatTimeoutSec = raw ? parseInt(raw, 10) : 300;
  }

  @Cron('* * * * *') // mỗi phút
  async cleanupExpiredSessions(): Promise<void> {
    try {
      const [expiredCount, staleCount] = await Promise.all([
        this.authSessionRepo.revokeExpiredSessions(),
        this.authSessionRepo.revokeStaleHeartbeatSessions(this.heartbeatTimeoutSec),
      ]);
      const total = expiredCount + staleCount;
      if (total > 0) {
        this.logger.debug(`Đã dọn ${total} phiên đăng nhập hết hạn (${expiredCount} quá 12h, ${staleCount} mất kết nối)`);
      }
    } catch (error) {
      this.logger.error('Dọn phiên đăng nhập thất bại', error);
    }
  }
}
