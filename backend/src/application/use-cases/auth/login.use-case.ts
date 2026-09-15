// Use Case: Login
// Layer: Application
// Dependency: IUserRepository, IJwtService (injected — không import NestJS trực tiếp)

import { Injectable, UnauthorizedException, ConflictException, Inject } from '@nestjs/common';
import { IUserRepository } from '../../../domain/repositories/user.repository';
import type { IAuthSessionRepository } from '../../../domain/repositories/auth-session.repository';
import { UserRole } from '../../../domain/entities/user.entity';
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
    @Inject('IAuthSessionRepository') private readonly authSessionRepo: IAuthSessionRepository,
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

    // Branch lock: chỉ 1 STAFF được online / chi nhánh tại 1 thời điểm
    if (user.role === UserRole.STAFF && user.branchId) {
      const activeCount = await this.authSessionRepo.countActiveStaffByBranch(user.branchId);
      if (activeCount > 0) {
        throw new ConflictException(
          'Chi nhánh này đang có nhân viên khác đăng nhập. Vui lòng chờ họ đăng xuất hoặc liên hệ KTTH/GĐ để cưỡng chế đăng xuất.',
        );
      }
    }

    // Refresh token: chỉ chứa sub + type, ký bằng secret KHÁC
    const refreshToken = this.jwtService.signRefresh({
      sub: user.id,
      type: 'refresh',
    });

    // Tạo auth_sessions record để khoá chi nhánh + cho phép cưỡng chế đăng xuất sau này
    const session = await this.authSessionRepo.create({
      userId: user.id,
      branchId: user.branchId ?? null,
      role: user.role,
      refreshTokenHash: refreshToken, // JWT refresh token đã ký, không phải secret hash riêng
      expiresAt: new Date(Date.now() + 3600 * 1000), // 1h — xem báo cáo Task 4 về lựa chọn này
    });

    // Access token: chứa role + branchId + sessionId để guard check không phải query DB
    const accessToken = this.jwtService.signAccess({
      sub: user.id,
      role: user.role,
      branchId: user.branchId ?? null,
      sessionId: session.id,
      type: 'access',
    });

    return {
      accessToken,
      refreshToken,
      sessionId: session.id,
      user: {
        id: user.id,
        username: user.username,
        email: user.email,
        fullName: user.fullName,
        role: user.role,
        branchId: user.branchId,
        branchName: user.branchName,
      },
    };
  }
}
