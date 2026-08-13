// DTOs: Công nợ
// Layer: Application

import {
  IsDateString, IsEnum, IsInt, IsOptional, IsNumber, IsPositive, IsString, IsUUID, Max, Min,
} from 'class-validator';
import { SUPPORTED_CURRENCIES } from '../../../domain/entities/currency';

const CURRENCIES = [...SUPPORTED_CURRENCIES];
const PROVIDERS = ['WU', 'MG'];

export class RecordDebtDto {
  @IsUUID()
  branchId: string;

  @IsEnum(PROVIDERS as any, { message: 'provider phải là WU hoặc MG' })
  providerCode: string;

  @IsEnum(CURRENCIES as any, { message: 'currency không hợp lệ' })
  currencyCode: string;

  @IsNumber({ maxDecimalPlaces: 2 })
  @IsPositive()
  amount: number;

  @IsOptional()
  @IsDateString()
  businessDate?: string;

  @IsOptional()
  @IsString()
  description?: string;
}

export class SettleUsdCashDebtDto {
  @IsInt()
  @Min(0)
  cashUsdAmount: number;

  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  @Max(0.99)
  oddUsdAmount: number;

  @IsOptional()
  @IsString()
  description?: string;
}

export class SettleVndCashDebtDto {
  @IsInt()
  @IsPositive()
  amount: number;

  @IsOptional()
  @IsString()
  description?: string;
}

export class ListDebtsQueryDto {
  @IsOptional()
  @IsUUID()
  branchId?: string;

  @IsOptional()
  @IsEnum(PROVIDERS as any)
  providerCode?: string;

  @IsOptional()
  @IsEnum(CURRENCIES as any)
  currencyCode?: string;

  @IsOptional()
  @IsDateString()
  businessDate?: string;

  @IsOptional()
  @IsDateString()
  dateFrom?: string;

  @IsOptional()
  @IsDateString()
  dateTo?: string;
}
