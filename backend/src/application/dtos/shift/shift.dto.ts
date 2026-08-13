// DTOs: Ca làm việc + Kiểm quỹ
// Layer: Application

import { IsUUID, IsArray, ValidateNested, IsEnum, IsNumber, Min, IsOptional, IsString, ArrayMinSize } from 'class-validator';
import { Type } from 'class-transformer';
import { SUPPORTED_CURRENCIES } from '../../../domain/entities/currency';

const CURRENCIES = [...SUPPORTED_CURRENCIES];

export class CountLineDto {
  @IsEnum(CURRENCIES as any, { message: 'currency không hợp lệ' })
  currency: string;

  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  actualAmount: number;
}

export class OpenShiftDto {
  @IsUUID()
  branchId: string;

  @IsArray()
  @ArrayMinSize(1)
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
  @ArrayMinSize(1)
  @ValidateNested({ each: true })
  @Type(() => CountLineDto)
  closingCounts: CountLineDto[];

  @IsOptional()
  @IsString()
  note?: string;
}
