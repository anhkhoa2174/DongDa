// JWT Strategy — Passport
// Layer: Interface

import { Injectable, UnauthorizedException, Inject } from '@nestjs/common';
import { PassportStrategy } from '@nestjs/passport';
import { ExtractJwt, Strategy } from 'passport-jwt';
import { IUserRepository } from '../../../domain/repositories/user.repository';
import type { IAuthSessionRepository } from '../../../domain/repositories/auth-session.repository';

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy) {
  constructor(
    @Inject('IUserRepository') private readonly userRepo: IUserRepository,
    @Inject('IAuthSessionRepository') private readonly authSessionRepo: IAuthSessionRepository,
  ) {
    super({
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
      ignoreExpiration: false,
      secretOrKey: process.env.JWT_SECRET!,
    });
  }

  async validate(payload: {
    sub: string;
    role: string;
    branchId: string | null;
    sessionId?: string;
    type?: 'access' | 'refresh';
  }) {
    // Reject refresh token nếu dùng làm access token (security: C2)
    if (payload.type !== 'access') {
      throw new UnauthorizedException('Token không hợp lệ');
    }

    const user = await this.userRepo.findById(payload.sub);
    if (!user || !user.isActive) {
      throw new UnauthorizedException('Phiên đăng nhập không hợp lệ');
    }

    // Session validation: chỉ áp dụng nếu token có sessionId (backward-compat với token cũ, nếu có)
    if (payload.sessionId) {
      const session = await this.authSessionRepo.findById(payload.sessionId);
      // session.userId phải khớp sub của chính token — phòng thủ theo chiều sâu:
      // không cho 1 token gắn nhầm/cố tình vào session của người khác.
      if (!session || session.userId !== payload.sub || session.isExpired()) {
        throw new UnauthorizedException('Phiên đăng nhập đã hết hạn hoặc bị thu hồi');
      }
    }

    // Trả về user object — gắn vào req.user
    const { password: _, ...safe } = user;
    return { ...safe, sessionId: payload.sessionId };
  }
}
