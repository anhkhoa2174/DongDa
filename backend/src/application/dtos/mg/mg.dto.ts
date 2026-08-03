// DTOs: MoneyGram
// Layer: Application

import { IsUUID, IsString, IsOptional, IsNumber, Min, IsEnum, IsPositive, Matches } from 'class-validator';

export class CreateMgDto {
  @IsUUID()
  branchId: string;

  @IsString()
  @Matches(/^[A-Z0-9]{8}$/, { message: 'Reference Number phải gồm đúng 8 ký tự chữ hoa hoặc số' })
  referenceNo: string;

  @IsOptional()
  @IsString()
  customerName?: string;

  @IsNumber()
  @IsPositive()
  mgUsdAmount: number;

  @IsNumber()
  @IsPositive()
  mgVndAmount: number;

  @IsEnum(['USD', 'VND'] as any, { message: 'payoutCurrency phải USD/VND' })
  payoutCurrency: string;

  @IsNumber()
  @IsPositive()
  payoutAmount: number;

  @IsNumber()
  @Min(0)
  receivedUsd: number;

  @IsNumber()
  @Min(0)
  receivedVnd: number;

  @IsNumber()
  @IsPositive()
  appliedRate: number;

  @IsEnum(['USD', 'VND'] as any, { message: 'paidCurrency phải USD/VND' })
  paidCurrency: string;
}

export class ListMgQueryDto {
  @IsOptional()
  @IsUUID()
  branchId?: string;
}
