// DTOs: Auth
// Layer: Application — dữ liệu đi vào/ra use-cases, validate bằng class-validator

import { IsString, IsNotEmpty, MinLength, MaxLength, Matches } from 'class-validator';

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
    fullName: string;
    role: string;
    branchId?: string;
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
  @MinLength(8)
  @MaxLength(100)
  @Matches(/^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)/, {
    message: 'Mật khẩu phải có ít nhất 1 chữ hoa, 1 chữ thường, 1 số',
  })
  newPassword: string;
}
