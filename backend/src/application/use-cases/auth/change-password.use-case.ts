// Use Case: Change Password
// Layer: Application

import { Injectable, UnauthorizedException, BadRequestException, Inject } from '@nestjs/common';
import { IUserRepository } from '../../../domain/repositories/user.repository';
import type { ChangePasswordDto } from '../../dtos/auth/auth.dto';

export interface IHashService {
  hash(plain: string): Promise<string>;
  compare(plain: string, hashed: string): Promise<boolean>;
}

@Injectable()
export class ChangePasswordUseCase {
  constructor(
    @Inject('IUserRepository') private readonly userRepo: IUserRepository,
    @Inject('IHashService') private readonly hashService: IHashService,
  ) {}

  async execute(userId: string, dto: ChangePasswordDto): Promise<void> {
    const user = await this.userRepo.findById(userId);
    if (!user) throw new UnauthorizedException();

    const currentValid = await this.hashService.compare(dto.currentPassword, user.password);
    if (!currentValid) {
      throw new UnauthorizedException('Mật khẩu hiện tại không đúng');
    }

    if (dto.currentPassword === dto.newPassword) {
      throw new BadRequestException('Mật khẩu mới phải khác mật khẩu cũ');
    }

    const hashedNew = await this.hashService.hash(dto.newPassword);
    await this.userRepo.update(userId, { password: hashedNew });
  }
}
