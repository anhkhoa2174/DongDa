// DTOs: User CRUD
// Layer: Application

import {
  IsString, IsNotEmpty, IsEmail, IsEnum, IsOptional,
  IsBoolean, MinLength, MaxLength, Matches,
} from 'class-validator';
import { UserRole } from '../../../domain/entities/user.entity';

export class CreateUserDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(50)
  @Matches(/^[a-zA-Z0-9_]+$/, { message: 'Username chỉ gồm chữ cái, số và dấu gạch dưới' })
  username: string;

  @IsEmail()
  email: string;

  @IsString()
  @MinLength(8)
  @MaxLength(100)
  @Matches(/^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)/, {
    message: 'Mật khẩu phải có ít nhất 1 chữ hoa, 1 chữ thường, 1 số',
  })
  password: string;

  @IsString()
  @IsNotEmpty()
  @MaxLength(100)
  fullName: string;

  @IsEnum(UserRole)
  role: UserRole;

  @IsOptional()
  @IsString()
  branchId?: string;
}

export class UpdateUserDto {
  @IsOptional()
  @IsEmail()
  email?: string;

  @IsOptional()
  @IsString()
  @MaxLength(100)
  fullName?: string;

  @IsOptional()
  @IsEnum(UserRole)
  role?: UserRole;

  @IsOptional()
  @IsString()
  branchId?: string;

  @IsOptional()
  @IsBoolean()
  isActive?: boolean;
}

export class UserResponseDto {
  id: string;
  username: string;
  email: string;
  fullName: string;
  role: UserRole;
  branchId?: string;
  isActive: boolean;
  createdAt: Date;
}
