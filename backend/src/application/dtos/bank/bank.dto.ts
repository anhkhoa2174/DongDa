// DTOs: Ngân hàng
// Layer: Application

import { IsUUID, IsNumber, IsPositive, IsOptional, IsString } from 'class-validator';

export class ReceiveFromProviderDto {
  @IsUUID()
  bankAccountId: string;

  @IsUUID()
  debtAccountId: string;

  @IsNumber()
  @IsPositive()
  amount: number;

  @IsOptional()
  @IsString()
  bankReference?: string;

  @IsOptional()
  @IsString()
  description?: string;
}
