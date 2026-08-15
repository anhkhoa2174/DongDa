// DTOs: Western Union
// Layer: Application

import {
  IsUUID, IsString, Matches, IsOptional, IsNumber, IsInt, Min, IsEnum, IsPositive,
} from 'class-validator';

export class CreateWuDto {
  @IsUUID()
  branchId: string;

  @Matches(/^\d{10}$/, { message: 'MSKH (MTCN) phải gồm đúng 10 chữ số' })
  mtcn: string;

  @IsOptional()
  @IsString()
  customerName?: string;

  @IsNumber({ maxDecimalPlaces: 2 })
  @IsPositive()
  wuUsdAmount: number;

  @IsInt({ message: 'Amount VND của WU phải là số nguyên' })
  @IsPositive()
  wuVndAmount: number;

  @IsInt({ message: 'USD thực trả phải là số nguyên' })
  @Min(0)
  receivedUsd: number;

  @IsInt({ message: 'VND thực trả phải là số nguyên' })
  @Min(0)
  receivedVnd: number;

  @IsNumber()
  @IsPositive()
  appliedRate: number;

  @IsEnum(['USD', 'VND'] as any, { message: 'payoutCurrency phải là USD hoặc VND' })
  payoutCurrency: string;

  @IsEnum(['USD', 'VND'] as any, { message: 'paidCurrency phải là USD hoặc VND' })
  paidCurrency: string;
}

export class ListWuQueryDto {
  @IsOptional()
  @IsUUID()
  branchId?: string;
}
