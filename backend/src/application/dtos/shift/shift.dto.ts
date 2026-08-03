// DTOs: Ca làm việc + Kiểm quỹ
// Layer: Application

import { IsUUID, IsArray, ValidateNested, IsEnum, IsNumber, Min, IsOptional, IsString } from 'class-validator';
import { Type } from 'class-transformer';

const CURRENCIES = ['VND', 'USD', 'EUR', 'AUD', 'JPY', 'GBP', 'SGD', 'THB', 'CNY', 'HKD', 'KRW'];

export class CountLineDto {
  @IsEnum(CURRENCIES as any, { message: 'currency không hợp lệ' })
  currency: string;

  @IsNumber()
  @Min(0)
  actualAmount: number;
}

export class OpenShiftDto {
  @IsUUID()
  branchId: string;

  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => CountLineDto)
  openingCounts: CountLineDto[];

  @IsOptional()
  @IsString()
  note?: string;
}

export class CloseShiftDto {
  @IsOptional()
  @IsUUID()
  branchId?: string;

  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => CountLineDto)
  closingCounts: CountLineDto[];

  @IsOptional()
  @IsString()
  note?: string;
}
