// DTOs: FX (Mua/Bán ngoại tệ)
// Layer: Application

import { IsUUID, IsBoolean, IsEnum, IsNumber, IsPositive, IsOptional, IsString } from 'class-validator';

const CURRENCIES = ['USD', 'EUR', 'AUD', 'JPY', 'GBP', 'SGD', 'THB', 'CNY', 'HKD', 'KRW'];

export class CreateFxDto {
  @IsUUID()
  branchId: string;

  @IsBoolean()
  isBuy: boolean; // true = mua từ khách, false = bán cho khách

  @IsEnum(CURRENCIES as any, { message: 'Loại ngoại tệ không hợp lệ' })
  fxCurrency: string;

  @IsNumber()
  @IsPositive()
  fxAmount: number;

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
