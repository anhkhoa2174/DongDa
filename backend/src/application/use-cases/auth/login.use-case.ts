// Use Case: Login
// Layer: Application
// Dependency: IUserRepository, IJwtService (injected — không import NestJS trực tiếp)

import { Injectable, UnauthorizedException, ConflictException, Inject } from '@nestjs/common';
import { Prisma } from '@prisma/client';
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

    // Tạo auth_sessions record để khoá chi nhánh + cho phép cưỡng chế đăng xuất sau này.
    // Check-then-act race: count check ở trên và create() ở đây là 2 DB call tách rời,
    // không serialize — 2 login đồng thời cùng chi nhánh có thể cùng pass count check
    // trước khi 1 trong 2 insert xong. Backstop thực sự là partial unique index
    // auth_sessions_one_active_staff_per_branch (branch_id, role) WHERE status='ACTIVE'
    // AND role='STAFF' (migration add_auth_sessions_branch_lock_unique) — bắt lỗi P2002
    // ở đây và trả về CÙNG message với pre-check để 2 nhánh không phân biệt được với caller.
    let session;
    try {
      session = await this.authSessionRepo.create({
        userId: user.id,
        branchId: user.branchId ?? null,
        role: user.role,
        // KHÔNG lưu refresh token thật vào đây. Trước đây field này chứa 1 JWT refresh
        // đã ký KHÔNG có claim sessionId — tức là 1 credential sống, và vì thiếu
        // sessionId nó đi đúng nhánh bỏ qua kiểm tra session trong refresh-token.use-case.ts:
        // ai đọc được DB (backup, log, SQL injection) có thể cấp access token mới vĩnh viễn,
        // miễn nhiễm force-logout. Field này write-only (không chỗ nào đọc/so sánh để xác
        // thực) nên ghi 1 placeholder không phải JWT hợp lệ — verifyRefresh() sẽ ném lỗi
        // ngay nếu có ai thử dùng nó ở /auth/refresh.
        refreshTokenHash: 'session-created',
        // 12h — absolute safety-cap cho session (đủ dài cho 1 ca làm việc), tách biệt
        // khỏi JWT access-token TTL. Tín hiệu "session còn sống" thực sự khi vận hành
        // bình thường là heartbeat staleness (Task 5 HeartbeatUseCase, timeout mặc định
        // 5 phút) — field này chỉ chặn trường hợp không ai đóng session và heartbeat
        // cũng không bắt được.
        expiresAt: new Date(Date.now() + 12 * 3600 * 1000),
      });
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
        throw new ConflictException(
          'Chi nhánh này đang có nhân viên khác đăng nhập. Vui lòng chờ họ đăng xuất hoặc liên hệ KTTH/GĐ để cưỡng chế đăng xuất.',
        );
      }
      throw error;
    }

    // Access token: chứa role + branchId + sessionId để guard check không phải query DB
    const accessToken = this.jwtService.signAccess({
      sub: user.id,
      role: user.role,
      branchId: user.branchId ?? null,
      sessionId: session.id,
      type: 'access',
    });

    // Refresh token cũng cần sessionId — nếu không, refresh-token.use-case.ts không biết
    // session nào để kiểm tra khi cấp access token mới, và enforcement session sẽ im lặng
    // ngừng hoạt động sau lần refresh đầu tiên (JwtStrategy bỏ qua session check khi JWT
    // không có sessionId, để tương thích ngược với token cũ trước tính năng này).
    const refreshTokenWithSession = this.jwtService.signRefresh({
      sub: user.id,
      sessionId: session.id,
      type: 'refresh',
    });

    return {
      accessToken,
      refreshToken: refreshTokenWithSession,
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
