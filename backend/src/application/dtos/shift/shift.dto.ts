// DTOs: Ca làm việc + Kiểm quỹ
// Layer: Application

import { IsUUID, IsArray, ValidateNested, IsEnum, IsNumber, IsInt, Min, IsOptional, IsString, ArrayMinSize } from 'class-validator';
import { Type } from 'class-transformer';
import { SUPPORTED_CURRENCIES } from '../../../domain/entities/currency';

const CURRENCIES = [...SUPPORTED_CURRENCIES];

export class DenominationCountDto {
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0.01)
  denomination: number;

  @IsInt()
  @Min(0)
  quantity: number;
}

export class CountLineDto {
  @IsEnum(CURRENCIES as any, { message: 'currency không hợp lệ' })
  currency: string;

  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  actualAmount: number;

  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => DenominationCountDto)
  denominations?: DenominationCountDto[];
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
