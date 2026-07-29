// DTOs: MoneyGram
// Layer: Application

import { IsUUID, IsString, IsOptional, IsNumber, Min, IsEnum, IsPositive, MinLength } from 'class-validator';

export class CreateMgDto {
  @IsUUID()
  branchId: string;

  @IsString()
  @MinLength(6, { message: 'Reference Number tối thiểu 6 ký tự' })
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
  @Min(0)
  payoutAmount: number;

  // MG không cho chọn tỷ giá (applied_rate = system_rate). Field này optional, bị bỏ qua.
  @IsOptional()
  @IsNumber()
  @IsPositive()
  appliedRate?: number;

  @IsEnum(['USD', 'VND'] as any, { message: 'paidCurrency phải USD/VND' })
  paidCurrency: string;
}

export class ListMgQueryDto {
  @IsOptional()
  @IsUUID()
  branchId?: string;
}
