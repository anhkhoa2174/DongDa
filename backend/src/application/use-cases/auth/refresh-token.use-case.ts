// Use Case: Refresh Token
// Layer: Application

import { Injectable, UnauthorizedException, Inject } from '@nestjs/common';
import { IUserRepository } from '../../../domain/repositories/user.repository';
import type { IJwtService } from './login.use-case';

export interface RefreshResult {
  accessToken: string;
  refreshToken: string;
}

@Injectable()
export class RefreshTokenUseCase {
  constructor(
    @Inject('IUserRepository') private readonly userRepo: IUserRepository,
    @Inject('IJwtService') private readonly jwtService: IJwtService,
  ) {}

  async execute(refreshToken: string): Promise<RefreshResult> {
    let payload: { sub: string; type?: string };
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

    // Rotate refresh token để chống replay
    return {
      accessToken: this.jwtService.signAccess({
        sub: user.id,
        role: user.role,
        branchId: user.branchId ?? null,
        type: 'access',
      }),
      refreshToken: this.jwtService.signRefresh({
        sub: user.id,
        type: 'refresh',
      }),
    };
  }
}
