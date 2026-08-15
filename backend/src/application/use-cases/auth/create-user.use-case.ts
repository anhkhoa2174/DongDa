// Use Case: Create User (chỉ ADMIN được tạo)
// Layer: Application

import { Injectable, ConflictException, ForbiddenException, Inject } from '@nestjs/common';
import { IUserRepository } from '../../../domain/repositories/user.repository';
import { UserRole } from '../../../domain/entities/user.entity';
import type { CreateUserDto, UserResponseDto } from '../../dtos/auth/user.dto';

export interface IHashService {
  hash(plain: string): Promise<string>;
}

@Injectable()
export class CreateUserUseCase {
  constructor(
    @Inject('IUserRepository') private readonly userRepo: IUserRepository,
    @Inject('IHashService') private readonly hashService: IHashService,
  ) {}

  async execute(
    dto: CreateUserDto,
    actorRole: UserRole,
  ): Promise<UserResponseDto> {
    // Chỉ ADMIN được tạo user mới
    if (actorRole !== UserRole.ADMIN) {
      throw new ForbiddenException('Chỉ Admin mới có quyền tạo tài khoản');
    }

    // Không cho tạo ADMIN thứ 2
    if (dto.role === UserRole.ADMIN) {
      const adminExists = await this.userRepo.existsAdmin();
      if (adminExists) {
        throw new ConflictException('Hệ thống chỉ cho phép 1 tài khoản Admin');
      }
    }

    const email = dto.email?.trim() || undefined;
    const [existingUsername, existingEmail] = await Promise.all([
      this.userRepo.findByUsername(dto.username),
      email ? this.userRepo.findByEmail(email) : Promise.resolve(null),
    ]);

    if (existingUsername) throw new ConflictException('Username đã tồn tại');
    if (existingEmail) throw new ConflictException('Email đã được sử dụng');

    // MANAGER và STAFF bắt buộc có branchId
    if ([UserRole.MANAGER, UserRole.STAFF].includes(dto.role) && !dto.branchId) {
      throw new ForbiddenException('MANAGER và STAFF phải thuộc một chi nhánh');
    }

    const hashedPassword = await this.hashService.hash(dto.password);

    const user = await this.userRepo.save({
      username: dto.username,
      email,
      password: hashedPassword,
      fullName: dto.fullName,
      role: dto.role,
      branchId: dto.branchId,
      isActive: true,
    });

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
}
