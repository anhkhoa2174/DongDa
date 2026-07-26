// DTOs: Công nợ
// Layer: Application

import { IsEnum, IsOptional, IsNumber, IsPositive, IsString, IsUUID } from 'class-validator';

const CURRENCIES = ['VND', 'USD', 'EUR', 'AUD', 'JPY', 'GBP', 'SGD', 'THB', 'CNY', 'HKD', 'KRW'];
const PROVIDERS = ['WU', 'MG'];

export class RecordDebtDto {
  @IsUUID()
  branchId: string;

  @IsEnum(PROVIDERS as any, { message: 'provider phải là WU hoặc MG' })
  providerCode: string;

  @IsEnum(CURRENCIES as any, { message: 'currency không hợp lệ' })
  currencyCode: string;

  @IsNumber()
  @IsPositive()
  amount: number;

  @IsOptional()
  @IsString()
  description?: string;
}

export class SettleDebtDto {
  @IsNumber()
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
}
