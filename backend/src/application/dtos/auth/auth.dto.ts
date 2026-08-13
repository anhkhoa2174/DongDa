// DTOs: Auth
// Layer: Application — dữ liệu đi vào/ra use-cases, validate bằng class-validator

import { IsString, IsNotEmpty, MinLength, MaxLength } from 'class-validator';

export class LoginDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(50)
  username: string;

  @IsString()
  @IsNotEmpty()
  @MaxLength(100)
  password: string;
}

export class LoginResponseDto {
  accessToken: string;
  refreshToken: string;
  user: {
    id: string;
    username: string;
    email?: string;
    fullName: string;
    role: string;
    branchId?: string;
    branchName?: string;
  };
}

export class RefreshTokenDto {
  @IsString()
  @IsNotEmpty()
  refreshToken: string;
}

export class ChangePasswordDto {
  @IsString()
  @IsNotEmpty()
  currentPassword: string;

  @IsString()
  @MinLength(6)
  @MaxLength(100)
  newPassword: string;
}
