// DTOs: Western Union
// Layer: Application

import {
  IsUUID, IsString, Matches, IsOptional, IsNumber, Min, IsEnum, IsPositive,
} from 'class-validator';

export class CreateWuDto {
  @IsUUID()
  branchId: string;

  @Matches(/^\d{10}$/, { message: 'MSKH (MTCN) phải gồm đúng 10 chữ số' })
  mtcn: string;

  @IsOptional()
  @IsString()
  customerName?: string;

  @IsNumber()
  @IsPositive()
  wuUsdAmount: number;

  @IsNumber()
  @IsPositive()
  wuVndAmount: number;

  @IsNumber()
  @Min(0)
  receivedUsd: number;

  @IsNumber()
  @Min(0)
  receivedVnd: number;

  @IsNumber()
  @IsPositive()
  appliedRate: number;

  @IsEnum(['USD', 'VND'] as any, { message: 'paidCurrency phải là USD hoặc VND' })
  paidCurrency: string;
}

export class ListWuQueryDto {
  @IsOptional()
  @IsUUID()
  branchId?: string;
}
