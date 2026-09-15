// Auth Controller
// Layer: Interface (HTTP)

import {
  Controller, Post, Get, Patch, Body, Param,
  UseGuards, Request, HttpCode, HttpStatus, Inject, Query,
  BadRequestException, ConflictException, NotFoundException,
} from '@nestjs/common';
import { LoginUseCase } from '../../../application/use-cases/auth/login.use-case';
import { CreateUserUseCase } from '../../../application/use-cases/auth/create-user.use-case';
import { ChangePasswordUseCase } from '../../../application/use-cases/auth/change-password.use-case';
import { RefreshTokenUseCase } from '../../../application/use-cases/auth/refresh-token.use-case';
import { HeartbeatUseCase } from '../../../application/use-cases/auth/heartbeat.use-case';
import { ForceLogoutStaffUseCase } from '../../../application/use-cases/auth/force-logout-staff.use-case';
import { JwtAuthGuard } from '../guards/jwt-auth.guard';
import { RolesGuard, Roles } from '../guards/roles.guard';
import { UserRole } from '../../../domain/entities/user.entity';
import { IUserRepository } from '../../../domain/repositories/user.repository';
import type { IAuthSessionRepository } from '../../../domain/repositories/auth-session.repository';
import { LoginDto, ChangePasswordDto, RefreshTokenDto } from '../../../application/dtos/auth/auth.dto';
import { CreateUserDto, UpdateUserDto } from '../../../application/dtos/auth/user.dto';
import { NotificationService } from '../../../infrastructure/notifications/notification.service';

@Controller('auth')
export class AuthController {
  constructor(
    private readonly loginUseCase: LoginUseCase,
    private readonly createUserUseCase: CreateUserUseCase,
    private readonly changePasswordUseCase: ChangePasswordUseCase,
    private readonly refreshTokenUseCase: RefreshTokenUseCase,
    private readonly notifications: NotificationService,
    @Inject('IAuthSessionRepository') private readonly authSessionRepo: IAuthSessionRepository,
    private readonly heartbeatUseCase: HeartbeatUseCase,
    private readonly forceLogoutStaffUseCase: ForceLogoutStaffUseCase,
  ) {}

  // POST /auth/login
  @Post('login')
  @HttpCode(HttpStatus.OK)
  async login(@Body() dto: LoginDto) {
    return this.loginUseCase.execute(dto);
  }

  // POST /auth/refresh — đổi refresh token lấy access token mới
  @Post('refresh')
  @HttpCode(HttpStatus.OK)
  async refresh(@Body() dto: RefreshTokenDto) {
    return this.refreshTokenUseCase.execute(dto.refreshToken);
  }

  // POST /auth/logout — thu hồi session ngay để giải phóng slot chi nhánh (không chờ heartbeat timeout)
  @Post('logout')
  @UseGuards(JwtAuthGuard)
  @HttpCode(HttpStatus.NO_CONTENT)
  async logout(@Request() req: any) {
    if (req.user.sessionId) {
      await this.authSessionRepo.revokeById(req.user.sessionId);
    }
  }

  // POST /auth/heartbeat — client gọi định kỳ để giữ phiên sống, giải phóng slot chi nhánh nếu bị treo
  @Post('heartbeat')
  @UseGuards(JwtAuthGuard)
  @HttpCode(HttpStatus.OK)
  async heartbeat(@Request() req: any) {
    if (!req.user.sessionId) {
      throw new BadRequestException('Token không có thông tin phiên đăng nhập');
    }
    const result = await this.heartbeatUseCase.execute(req.user.sessionId);
    return {
      sessionId: result.sessionId,
      isStale: result.isStale,
      expiresAt: result.expiresAt.toISOString(),
    };
  }

  // POST /auth/staff/:sessionId/force-logout — GĐ/KTTH cưỡng chế đăng xuất 1 phiên Staff bị treo
  @Post('staff/:sessionId/force-logout')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.ADMIN, UserRole.MANAGER)
  @HttpCode(HttpStatus.OK)
  async forceLogoutStaff(@Request() req: any, @Param('sessionId') sessionId: string) {
    const result = await this.forceLogoutStaffUseCase.execute(req.user.id, sessionId);
    return {
      revokedSessionId: result.revokedSessionId,
      userId: result.userId,
      branchId: result.branchId,
    };
  }

  // GET /auth/me
  @Get('me')
  @UseGuards(JwtAuthGuard)
  async getMe(@Request() req: any) {
    const { password: _, ...safe } = req.user;
    return safe;
  }

  // PATCH /auth/change-password
  @Patch('change-password')
  @UseGuards(JwtAuthGuard)
  @HttpCode(HttpStatus.NO_CONTENT)
  async changePassword(@Request() req: any, @Body() dto: ChangePasswordDto) {
    await this.changePasswordUseCase.execute(req.user.id, dto);
    await this.notifications.notifyUsers({
      title: 'Mật khẩu đã được thay đổi',
      body: 'Mật khẩu đăng nhập của bạn vừa được cập nhật thành công.',
      sourceType: 'PASSWORD_CHANGED',
      sourceId: req.user.id,
    }, { userIds: [req.user.id] });
  }
}

@Controller('users')
export class UserController {
  constructor(
    private readonly createUserUseCase: CreateUserUseCase,
    @Inject('IUserRepository') private readonly userRepo: IUserRepository,
    private readonly notifications: NotificationService,
  ) {}

  @Get()
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.ADMIN)
  async listUsers(
    @Query('role') role?: UserRole,
    @Query('branchId') branchId?: string,
    @Query('isActive') isActive?: string,
  ) {
    const users = await this.userRepo.findAll({
      ...(role && { role }),
      ...(branchId && { branchId }),
      ...(isActive !== undefined && { isActive: isActive === 'true' }),
    });
    return users.map(toUserResponse);
  }

  // POST /users — chỉ ADMIN
  @Post()
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.ADMIN)
  async createUser(@Request() req: any, @Body() dto: CreateUserDto) {
    const created = await this.createUserUseCase.execute(dto, req.user.role);
    await this.notifications.notifyUsers({
      title: 'Tài khoản đã được tạo',
      body: `Tài khoản ${created.username} đã được kích hoạt với vai trò ${created.role}.`,
      sourceType: 'ACCOUNT_CREATED',
      sourceId: created.id,
    }, { userIds: [created.id], roles: ['ADMIN'], excludeUserIds: [] });
    return created;
  }

  @Patch(':id')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.ADMIN)
  async updateUser(@Request() req: any, @Param('id') id: string, @Body() dto: UpdateUserDto) {
    const current = await this.userRepo.findById(id);
    if (!current) throw new NotFoundException('Tài khoản không tồn tại');
    if (current.role === UserRole.ADMIN && (dto.isActive === false || (dto.role && dto.role !== UserRole.ADMIN))) {
      throw new BadRequestException('Không thể vô hiệu hóa hoặc đổi vai trò tài khoản Giám đốc');
    }
    if (dto.role === UserRole.ADMIN && current.role !== UserRole.ADMIN && await this.userRepo.existsAdmin()) {
      throw new ConflictException('Hệ thống chỉ cho phép 1 tài khoản Giám đốc');
    }
    const updated = await this.userRepo.update(id, dto);
    await this.notifications.notifyUsers({
      title: 'Thông tin tài khoản đã thay đổi',
      body: `Tài khoản ${updated.username} vừa được cập nhật.`,
      sourceType: 'ACCOUNT_UPDATED',
      sourceId: id,
    }, { userIds: [id, req.user.id], roles: ['ADMIN'] });
    return toUserResponse(updated);
  }

  @Patch(':id/deactivate')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.ADMIN)
  async deactivateUser(@Param('id') id: string, @Request() req: any) {
    const current = await this.userRepo.findById(id);
    if (!current) throw new NotFoundException('Tài khoản không tồn tại');
    if (id === req.user.id || current.role === UserRole.ADMIN) {
      throw new BadRequestException('Không thể vô hiệu hóa tài khoản Giám đốc');
    }
    const updated = await this.userRepo.deactivate(id);
    await this.notifications.notifyUsers({
      title: 'Tài khoản đã được vô hiệu hóa',
      body: `Tài khoản ${updated.username} đã được vô hiệu hóa.`,
      sourceType: 'ACCOUNT_DEACTIVATED',
      sourceId: id,
    }, { userIds: [req.user.id], roles: ['ADMIN'] });
    return toUserResponse(updated);
  }
}

function toUserResponse(user: any) {
  return {
    id: user.id,
    username: user.username,
    email: user.email,
    fullName: user.fullName,
    role: user.role,
    branchId: user.branchId,
    isActive: user.isActive,
    createdAt: user.createdAt,
  };
}
