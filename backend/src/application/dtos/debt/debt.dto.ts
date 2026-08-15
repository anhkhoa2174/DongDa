// DTOs: Công nợ
// Layer: Application

import {
  ArrayMinSize, ArrayUnique, IsArray, IsDateString, IsEnum, IsIn, IsInt, IsOptional,
  IsNumber, IsPositive, IsString, IsUUID, Max, MaxLength, Min,
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

export class SettleDebtBatchDto {
  @IsArray()
  @ArrayMinSize(1)
  @ArrayUnique()
  @IsUUID('4', { each: true })
  debtAccountIds: string[];

  @IsNumber({ maxDecimalPlaces: 2 })
  @IsPositive()
  amount: number;

  @IsIn(['CASH', 'BANK'])
  settlementSource: 'CASH' | 'BANK';

  @IsOptional()
  @IsUUID()
  bankAccountId?: string;

  @IsOptional()
  @IsString()
  @MaxLength(150)
  bankReference?: string;

  @IsOptional()
  @IsString()
  @MaxLength(500)
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
