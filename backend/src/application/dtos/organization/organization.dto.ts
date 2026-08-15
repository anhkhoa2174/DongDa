import {
  IsDateString, IsEmail, IsEnum, IsOptional, IsString, IsUUID, Matches, MaxLength, MinLength, ValidateNested,
} from 'class-validator';
import { Type } from 'class-transformer';
import { UserRole } from '../../../domain/entities/user.entity';

export class CreateEmployeeAccountDto {
  @IsString()
  @MaxLength(100)
  @Matches(/^[a-zA-Z0-9_]+$/, { message: 'Username chỉ gồm chữ cái, số và dấu gạch dưới' })
  username: string;

  @IsString()
  @MinLength(6)
  @MaxLength(100)
  password: string;

  @IsEnum(UserRole)
  role: UserRole;
}

export class CreateEmployeeDto {
  @IsUUID()
  branchId: string;

  @IsOptional()
  @IsString()
  @MaxLength(50)
  employeeCode?: string;

  @IsString()
  @MaxLength(255)
  fullName: string;

  @IsOptional()
  @IsString()
  @MaxLength(30)
  phone?: string;

  @IsOptional()
  @IsEmail()
  email?: string;

  @IsOptional()
  @IsDateString()
  hiredAt?: string;

  @IsOptional()
  @ValidateNested()
  @Type(() => CreateEmployeeAccountDto)
  account?: CreateEmployeeAccountDto;
}
