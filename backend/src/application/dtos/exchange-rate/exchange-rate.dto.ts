// DTOs: ExchangeRate
// Layer: Application

import {
  IsEnum, IsOptional, IsNumber, IsPositive, IsISO8601,
  IsInt, Min, Max, IsString, MaxLength,
  IsArray, ArrayMinSize, ArrayMaxSize, ValidateNested,
  IsIn,
} from 'class-validator';
import { Type } from 'class-transformer';
import {
  ExchangeRateType, RateStatus, ServiceProvider, CurrencyCode,
} from '../../../domain/entities/exchange-rate.entity';
import { SUPPORTED_CURRENCIES } from '../../../domain/entities/currency';

const CURRENCIES: CurrencyCode[] = [...SUPPORTED_CURRENCIES];

export class CreateExchangeRateDto {
  @IsEnum(ExchangeRateType)
  rateType: ExchangeRateType;

  @IsOptional()
  @IsEnum(ServiceProvider)
  provider?: ServiceProvider;

  @IsEnum(CURRENCIES as any, { message: 'from_currency không hợp lệ' })
  fromCurrency: CurrencyCode;

  @IsOptional()
  @IsEnum(CURRENCIES as any, { message: 'to_currency không hợp lệ' })
  toCurrency?: CurrencyCode;

  @IsOptional()
  @IsNumber()
  @IsPositive()
  buyRate?: number;

  @IsOptional()
  @IsNumber()
  @IsPositive()
  sellRate?: number;

  @IsNumber()
  @IsPositive()
  rate: number;

  @IsOptional()
  @IsISO8601()
  effectiveFrom?: string; // ISO; mặc định now nếu bỏ trống
}

export class CreateExchangeRateBatchDto {
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(100)
  @ValidateNested({ each: true })
  @Type(() => CreateExchangeRateDto)
  rates: CreateExchangeRateDto[];
}

export class ListRatesQueryDto {
  @IsOptional()
  @IsEnum(RateStatus)
  status?: RateStatus;

  @IsOptional()
  @IsEnum(ExchangeRateType)
  rateType?: ExchangeRateType;

  @IsOptional()
  @IsEnum(ServiceProvider)
  provider?: ServiceProvider;
}

export class ExchangeRateHistoryQueryDto {
  @IsOptional()
  @IsEnum(RateStatus)
  status?: RateStatus;

  @IsOptional()
  @IsEnum(ExchangeRateType)
  rateType?: ExchangeRateType;

  @IsOptional()
  @IsIn(['PAID', 'FX', 'BANK'])
  rateGroup?: 'PAID' | 'FX' | 'BANK';

  @IsOptional()
  @IsISO8601()
  from?: string;

  @IsOptional()
  @IsISO8601()
  to?: string;

  @IsOptional()
  @IsString()
  @MaxLength(100)
  keyword?: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page = 1;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  pageSize = 10;
}

export interface RateResponseDto {
  id: string;
  rateType: ExchangeRateType;
  provider?: ServiceProvider | null;
  fromCurrency: CurrencyCode;
  toCurrency: CurrencyCode;
  buyRate?: number | null;
  sellRate?: number | null;
  rate: number;
  effectiveFrom: Date;
  effectiveTo?: Date | null;
  status: RateStatus;
  createdByUserId: string;
  approvedByUserId?: string | null;
  approvedAt?: Date | null;
  createdAt: Date;
}
