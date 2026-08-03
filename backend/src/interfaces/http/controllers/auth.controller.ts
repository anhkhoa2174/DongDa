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
import { JwtAuthGuard } from '../guards/jwt-auth.guard';
import { RolesGuard, Roles } from '../guards/roles.guard';
import { UserRole } from '../../../domain/entities/user.entity';
import { IUserRepository } from '../../../domain/repositories/user.repository';
import { LoginDto, ChangePasswordDto, RefreshTokenDto } from '../../../application/dtos/auth/auth.dto';
import { CreateUserDto, UpdateUserDto } from '../../../application/dtos/auth/user.dto';

@Controller('auth')
export class AuthController {
  constructor(
    private readonly loginUseCase: LoginUseCase,
    private readonly createUserUseCase: CreateUserUseCase,
    private readonly changePasswordUseCase: ChangePasswordUseCase,
    private readonly refreshTokenUseCase: RefreshTokenUseCase,
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

  // POST /auth/logout — client xóa token; server có thể blacklist nếu cần
  @Post('logout')
  @UseGuards(JwtAuthGuard)
  @HttpCode(HttpStatus.NO_CONTENT)
  async logout() {
    // Stateless JWT: client tự xóa token
    // TODO: implement token blacklist nếu cần force logout
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
  }
}

@Controller('users')
export class UserController {
  constructor(
    private readonly createUserUseCase: CreateUserUseCase,
    @Inject('IUserRepository') private readonly userRepo: IUserRepository,
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
    return this.createUserUseCase.execute(dto, req.user.role);
  }

  @Patch(':id')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.ADMIN)
  async updateUser(@Param('id') id: string, @Body() dto: UpdateUserDto) {
    const current = await this.userRepo.findById(id);
    if (!current) throw new NotFoundException('Tài khoản không tồn tại');
    if (current.role === UserRole.ADMIN && (dto.isActive === false || (dto.role && dto.role !== UserRole.ADMIN))) {
      throw new BadRequestException('Không thể vô hiệu hóa hoặc đổi vai trò tài khoản Giám đốc');
    }
    if (dto.role === UserRole.ADMIN && current.role !== UserRole.ADMIN && await this.userRepo.existsAdmin()) {
      throw new ConflictException('Hệ thống chỉ cho phép 1 tài khoản Giám đốc');
    }
    const updated = await this.userRepo.update(id, dto);
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
