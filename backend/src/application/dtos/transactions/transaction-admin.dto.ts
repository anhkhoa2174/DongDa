import { IsEnum, IsObject, IsOptional, IsString, MaxLength, ValidateIf } from 'class-validator';

export class VoidTransactionDto {
  @IsString()
  @MaxLength(500)
  reason: string;
}

export class CreateTransactionAdjustmentDto {
  @IsEnum(['VOID', 'REPLACE'] as any, { message: 'action phải là VOID hoặc REPLACE' })
  action: 'VOID' | 'REPLACE';

  @IsString()
  @MaxLength(500)
  reason: string;

  @IsOptional()
  @IsString()
  @MaxLength(1000)
  proposedCorrection?: string;

  @ValidateIf((dto) => dto.action === 'REPLACE')
  @IsObject({ message: 'Phiếu thay thế phải có số tiền điều chỉnh' })
  correctedData?: Record<string, unknown>;
}

export class UpdateTransactionMetadataDto {
  @IsOptional()
  @IsString()
  @MaxLength(255)
  customerName?: string;

  @IsOptional()
  @IsString()
  @MaxLength(30)
  customerPhone?: string;

  @IsString()
  @MaxLength(500)
  reason: string;
}
