// Use Case: Login
// Layer: Application
// Dependency: IUserRepository, IJwtService (injected — không import NestJS trực tiếp)

import { Injectable, UnauthorizedException, Inject } from '@nestjs/common';
import { IUserRepository } from '../../../domain/repositories/user.repository';
import type { LoginDto, LoginResponseDto } from '../../dtos/auth/auth.dto';

export interface IJwtService {
  signAccess(payload: Record<string, unknown>): string;
  signRefresh(payload: Record<string, unknown>): string;
  verifyAccess(token: string): Record<string, unknown>;
  verifyRefresh(token: string): Record<string, unknown>;
}

export interface IHashService {
  compare(plain: string, hashed: string): Promise<boolean>;
}

@Injectable()
export class LoginUseCase {
  constructor(
    @Inject('IUserRepository') private readonly userRepo: IUserRepository,
    @Inject('IJwtService') private readonly jwtService: IJwtService,
    @Inject('IHashService') private readonly hashService: IHashService,
  ) {}

  async execute(dto: LoginDto): Promise<LoginResponseDto> {
    const user = await this.userRepo.findByUsername(dto.username);

    // Không phân biệt "user không tồn tại" vs "sai mật khẩu" — tránh user enumeration
    if (!user || !user.isActive) {
      throw new UnauthorizedException('Tên đăng nhập hoặc mật khẩu không đúng');
    }

    const passwordValid = await this.hashService.compare(dto.password, user.password);
    if (!passwordValid) {
      throw new UnauthorizedException('Tên đăng nhập hoặc mật khẩu không đúng');
    }

    // Access token: chứa role + branchId để guard check không phải query DB
    const accessToken = this.jwtService.signAccess({
      sub: user.id,
      role: user.role,
      branchId: user.branchId ?? null,
      type: 'access',
    });

    // Refresh token: chỉ chứa sub + type, ký bằng secret KHÁC
    const refreshToken = this.jwtService.signRefresh({
      sub: user.id,
      type: 'refresh',
    });

    return {
      accessToken,
      refreshToken,
      user: {
        id: user.id,
        username: user.username,
        fullName: user.fullName,
        role: user.role,
        branchId: user.branchId,
      },
    };
  }
}
