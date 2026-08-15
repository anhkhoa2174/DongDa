// DTOs: Ngân hàng
// Layer: Application

import {
  IsUUID, IsNumber, IsPositive, IsOptional, IsString, IsEnum, IsIn, Min, MaxLength, IsDateString, Matches,
} from 'class-validator';
import { SUPPORTED_CURRENCIES } from '../../../domain/entities/currency';

export class ReceiveFromProviderDto {
  @IsUUID()
  bankAccountId: string;

  @IsUUID()
  debtAccountId: string;

  @IsNumber({ maxDecimalPlaces: 2 })
  @IsPositive()
  amount: number;

  @IsOptional()
  @IsString()
  bankReference?: string;

  @IsOptional()
  @IsString()
  description?: string;
}

export class CreateBankAccountDto {
  @IsUUID()
  branchId: string;

  @IsString()
  @Matches(/^[A-Za-z0-9_-]{2,20}$/, { message: 'Mã ngân hàng chỉ gồm chữ/số, 2-20 ký tự (vd ACB, MSB)' })
  bankCode: string;

  @IsOptional()
  @IsString()
  @MaxLength(255)
  bankName?: string;

  @IsString()
  @MaxLength(100)
  accountNo: string;

  @IsString()
  @MaxLength(255)
  accountName: string;

  @IsIn(SUPPORTED_CURRENCIES as unknown as string[])
  currencyCode: string;

  @IsOptional()
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  openingBalance?: number;
}

export const MANUAL_BANK_MOVEMENT_TYPES = ['DEPOSIT', 'WITHDRAW', 'TRANSFER_IN', 'TRANSFER_OUT'] as const;

export class CreateBankMovementDto {
  @IsEnum(MANUAL_BANK_MOVEMENT_TYPES as unknown as object, { message: 'movementType phải là DEPOSIT/WITHDRAW/TRANSFER_IN/TRANSFER_OUT' })
  movementType: (typeof MANUAL_BANK_MOVEMENT_TYPES)[number];

  @IsNumber({ maxDecimalPlaces: 2 })
  @IsPositive()
  amount: number;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  description?: string;

  @IsOptional()
  @IsString()
  @MaxLength(150)
  bankReference?: string;

  @IsOptional()
  @IsString()
  @MaxLength(255)
  counterparty?: string;

  @IsOptional()
  @IsDateString()
  businessDate?: string;
}
