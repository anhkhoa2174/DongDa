// DTOs: Đối chiếu Journal
// Layer: Application

import { IsEnum, IsArray, ValidateNested, IsString, IsNumber, IsOptional, IsUUID, IsDateString, Min, ArrayMinSize } from 'class-validator';
import { Type } from 'class-transformer';

export class JournalRowDto {
  @IsString()
  code: string; // MSKH / Reference Number

  @IsNumber()
  @Min(0)
  amount: number; // USD

  @IsOptional()
  @IsEnum(['USD', 'VND'] as any)
  currencyCode?: 'USD' | 'VND';

  @IsOptional()
  @IsUUID()
  branchId?: string;

  @IsOptional()
  @IsString()
  customerName?: string;
}

export class RunReconciliationDto {
  @IsEnum(['WU', 'MG'] as any, { message: 'provider phải WU/MG' })
  provider: string;

  @IsDateString()
  businessDate: string;

  @IsOptional()
  @IsUUID()
  branchId?: string;

  @IsArray()
  @ArrayMinSize(1)
  @ValidateNested({ each: true })
  @Type(() => JournalRowDto)
  rows: JournalRowDto[];
}
