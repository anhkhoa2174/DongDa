// Use Case: Refresh Token
// Layer: Application

import { Injectable, UnauthorizedException, Inject } from '@nestjs/common';
import { IUserRepository } from '../../../domain/repositories/user.repository';
import type { IJwtService } from './login.use-case';
import type { IAuthSessionRepository } from '../../../domain/repositories/auth-session.repository';

export interface RefreshResult {
  accessToken: string;
  refreshToken: string;
}

@Injectable()
export class RefreshTokenUseCase {
  constructor(
    @Inject('IUserRepository') private readonly userRepo: IUserRepository,
    @Inject('IJwtService') private readonly jwtService: IJwtService,
    @Inject('IAuthSessionRepository') private readonly authSessionRepo: IAuthSessionRepository,
  ) {}

  async execute(refreshToken: string): Promise<RefreshResult> {
    let payload: { sub: string; sessionId?: string; type?: string };
    try {
      payload = this.jwtService.verifyRefresh(refreshToken) as any;
    } catch {
      throw new UnauthorizedException('Refresh token không hợp lệ hoặc đã hết hạn');
    }

    if (payload.type !== 'refresh') {
      throw new UnauthorizedException('Token không hợp lệ');
    }

    const user = await this.userRepo.findById(payload.sub);
    if (!user || !user.isActive) {
      throw new UnauthorizedException('Phiên đăng nhập không hợp lệ');
    }

    // Nếu refresh token có sessionId (token mới, từ sau tính năng khoá chi nhánh), phải
    // kiểm tra session còn sống — nếu không, 1 Staff bị cưỡng chế đăng xuất hoặc hết hạn
    // heartbeat vẫn có thể "quay lại" bằng refresh token cũ, vô hiệu hoá force-logout.
    // Token cũ (không có sessionId, từ trước tính năng này) bỏ qua bước này — tương thích ngược.
    if (payload.sessionId) {
      const session = await this.authSessionRepo.findById(payload.sessionId);
      if (!session || session.isExpired()) {
        throw new UnauthorizedException('Phiên đăng nhập đã hết hạn hoặc bị thu hồi');
      }
    }

    // Rotate refresh token để chống replay — cả access lẫn refresh đều mang lại sessionId
    // nếu có, để lần refresh KẾ TIẾP vẫn kiểm tra được session.
    return {
      accessToken: this.jwtService.signAccess({
        sub: user.id,
        role: user.role,
        branchId: user.branchId ?? null,
        sessionId: payload.sessionId,
        type: 'access',
      }),
      refreshToken: this.jwtService.signRefresh({
        sub: user.id,
        sessionId: payload.sessionId,
        type: 'refresh',
      }),
    };
  }
}
