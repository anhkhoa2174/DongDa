// DTOs: FX (Mua/Bán ngoại tệ)
// Layer: Application

import { IsUUID, IsBoolean, IsEnum, IsNumber, IsPositive, IsOptional, IsString, Max, Min } from 'class-validator';
import { FOREIGN_CURRENCIES } from '../../../domain/entities/currency';

const CURRENCIES = [...FOREIGN_CURRENCIES];

export class CreateFxDto {
  @IsUUID()
  branchId: string;

  @IsBoolean()
  isBuy: boolean; // true = mua từ khách, false = bán cho khách

  @IsEnum(CURRENCIES as any, { message: 'Loại ngoại tệ không hợp lệ' })
  fxCurrency: string;

  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  fxAmount: number;

  @IsOptional()
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  @Max(0.99)
  fractionalAmount?: number;

  @IsOptional()
  @IsNumber({ maxDecimalPlaces: 0 })
  @Min(0)
  deductionVnd?: number;

  @IsNumber()
  @IsPositive()
  rate: number;

  @IsOptional()
  @IsString()
  customerName?: string;
}

export class ListFxQueryDto {
  @IsOptional()
  @IsUUID()
  branchId?: string;
}
