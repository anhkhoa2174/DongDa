// DTOs: User CRUD
// Layer: Application

import {
  IsString, IsNotEmpty, IsEmail, IsEnum, IsOptional,
  IsBoolean, MinLength, MaxLength, Matches, IsUUID,
} from 'class-validator';
import { UserRole } from '../../../domain/entities/user.entity';

export class CreateUserDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(50)
  @Matches(/^[a-zA-Z0-9_]+$/, { message: 'Username chỉ gồm chữ cái, số và dấu gạch dưới' })
  username: string;

  @IsOptional()
  @IsEmail()
  email?: string;

  @IsString()
  @MinLength(6)
  @MaxLength(100)
  password: string;

  @IsString()
  @IsNotEmpty()
  @MaxLength(100)
  fullName: string;

  @IsEnum(UserRole)
  role: UserRole;

  @IsOptional()
  @IsUUID()
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
  @IsUUID()
  branchId?: string;

  @IsOptional()
  @IsBoolean()
  isActive?: boolean;
}

export class UserResponseDto {
  id: string;
  username: string;
  email?: string;
  fullName: string;
  role: UserRole;
  branchId?: string;
  isActive: boolean;
  createdAt: Date;
}
