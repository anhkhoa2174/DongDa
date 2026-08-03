import { IsOptional, IsString, MaxLength } from 'class-validator';

export class VoidTransactionDto {
  @IsString()
  @MaxLength(500)
  reason: string;
}

export class RequestTransactionChangeDto {
  @IsString()
  @MaxLength(500)
  reason: string;

  @IsOptional()
  @IsString()
  @MaxLength(1000)
  proposedCorrection?: string;
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
