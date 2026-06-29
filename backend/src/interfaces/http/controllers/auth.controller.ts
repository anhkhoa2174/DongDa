// Auth Controller
// Layer: Interface (HTTP)

import {
  Controller, Post, Get, Patch, Body, Param,
  UseGuards, Request, HttpCode, HttpStatus,
} from '@nestjs/common';
import { LoginUseCase } from '../../../application/use-cases/auth/login.use-case';
import { CreateUserUseCase } from '../../../application/use-cases/auth/create-user.use-case';
import { ChangePasswordUseCase } from '../../../application/use-cases/auth/change-password.use-case';
import { RefreshTokenUseCase } from '../../../application/use-cases/auth/refresh-token.use-case';
import { JwtAuthGuard } from '../guards/jwt-auth.guard';
import { RolesGuard, Roles } from '../guards/roles.guard';
import { UserRole } from '../../../domain/entities/user.entity';
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
  constructor(private readonly createUserUseCase: CreateUserUseCase) {}

  // POST /users — chỉ ADMIN
  @Post()
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.ADMIN)
  async createUser(@Request() req: any, @Body() dto: CreateUserDto) {
    return this.createUserUseCase.execute(dto, req.user.role);
  }
}
