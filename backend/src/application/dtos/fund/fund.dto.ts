// DTOs: Quỹ & Điều chuyển
// Layer: Application

import { IsEnum, IsOptional, IsNumber, IsPositive, IsUUID } from 'class-validator';

const CURRENCIES = ['VND', 'USD', 'EUR', 'AUD', 'JPY', 'GBP', 'SGD', 'THB', 'CNY', 'HKD', 'KRW'];

export class CreateTransferDto {
  @IsUUID()
  sourceBranchId: string;

  @IsUUID()
  destinationBranchId: string;

  @IsEnum(CURRENCIES as any, { message: 'currency không hợp lệ' })
  currencyCode: string;

  @IsNumber()
  @IsPositive()
  amount: number;
}

export class ListTransfersQueryDto {
  @IsOptional()
  @IsUUID()
  branchId?: string;

  @IsOptional()
  status?: string;
}
