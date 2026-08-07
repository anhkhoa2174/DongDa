// DTOs: Ca làm việc + Kiểm quỹ
// Layer: Application

import { IsUUID, IsArray, ValidateNested, IsEnum, IsNumber, Min, IsOptional, IsString, ArrayMinSize } from 'class-validator';
import { Type } from 'class-transformer';

const CURRENCIES = [
  'VND', 'USD', 'EUR', 'AUD', 'JPY', 'GBP', 'SGD', 'THB', 'CNY', 'HKD', 'KRW',
  'CAD', 'CHF', 'NZD', 'TWD', 'MYR', 'IDR', 'PHP', 'LAK', 'KHR',
];

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
