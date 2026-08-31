// DTOs: Western Union
// Layer: Application

import {
  IsUUID, IsString, Matches, IsOptional, IsNumber, IsInt, Min, IsEnum, IsPositive,
  IsDateString, MaxLength,
  IsBoolean, ValidateIf,
} from 'class-validator';

export class CreateWuDto {
  @IsUUID()
  branchId: string;

  @IsUUID()
  bankAccountId: string;

  @Matches(/^\d{10}$/, { message: 'MSKH (MTCN) phải gồm đúng 10 chữ số' })
  mtcn: string;

  @IsString()
  @MaxLength(150)
  customerName?: string;

  @IsString()
  @MaxLength(100)
  sendingCountry: string;

  @IsOptional()
  @IsString()
  @MaxLength(100)
  senderState?: string;

  @IsDateString()
  receiverDateOfBirth: string;

  @IsString()
  @MaxLength(30)
  customerPhone: string;

  @IsString()
  @MaxLength(255)
  currentAddress: string;

  @IsOptional()
  @IsString()
  @MaxLength(255)
  identityAddress?: string;

  @IsString()
  @MaxLength(50)
  identityDocumentType: string;

  @IsString()
  @MaxLength(100)
  identityDocumentNumber: string;

  @IsString()
  @MaxLength(100)
  identityIssuingCountry: string;

  @IsDateString()
  identityIssueDate: string;

  @IsDateString()
  identityExpiryDate: string;

  @IsBoolean()
  hasVisa: boolean;

  @ValidateIf((value) => value.hasVisa)
  @IsString()
  @MaxLength(100)
  visaNumber?: string;

  @ValidateIf((value) => value.hasVisa)
  @IsDateString()
  visaIssueDate?: string;

  @ValidateIf((value) => value.hasVisa)
  @IsDateString()
  visaExpiryDate?: string;

  @IsString()
  @MaxLength(100)
  employmentStatus: string;

  @IsString()
  @MaxLength(100)
  countryOfBirth: string;

  @IsString()
  @MaxLength(100)
  senderRelationship: string;

  @IsString()
  @MaxLength(150)
  receivePurpose: string;

  @IsString()
  @MaxLength(150)
  senderName: string;

  @IsDateString()
  receivedDate: string;

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
