// JWT Strategy — Passport
// Layer: Interface

import { Injectable, UnauthorizedException, Inject } from '@nestjs/common';
import { PassportStrategy } from '@nestjs/passport';
import { ExtractJwt, Strategy } from 'passport-jwt';
import { IUserRepository } from '../../../domain/repositories/user.repository';

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy) {
  constructor(
    @Inject('IUserRepository') private readonly userRepo: IUserRepository,
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
    // Trả về user object — gắn vào req.user
    const { password: _, ...safe } = user;
    return safe;
  }
}
