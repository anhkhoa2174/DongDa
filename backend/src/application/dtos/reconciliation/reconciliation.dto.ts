// DTOs: Đối chiếu Journal
// Layer: Application

import { IsEnum, IsArray, ValidateNested, IsString, IsNumber, IsOptional } from 'class-validator';
import { Type } from 'class-transformer';

export class JournalRowDto {
  @IsString()
  code: string; // MSKH / Reference Number

  @IsNumber()
  amount: number; // USD

  @IsOptional()
  @IsString()
  customerName?: string;
}

export class RunReconciliationDto {
  @IsEnum(['WU', 'MG'] as any, { message: 'provider phải WU/MG' })
  provider: string;

  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => JournalRowDto)
  rows: JournalRowDto[];
}
