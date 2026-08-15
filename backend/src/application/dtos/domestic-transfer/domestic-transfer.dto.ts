import { IsEnum, IsInt, IsOptional, IsString, IsUUID, MaxLength, Min, IsPositive } from 'class-validator';

export class CreateDomesticTransferDto {
  @IsUUID()
  branchId: string;

  @IsEnum(['CASH_TO_BANK', 'BANK_TO_CASH'] as any, {
    message: 'Loại giao dịch phải là CASH_TO_BANK hoặc BANK_TO_CASH',
  })
  transferType: 'CASH_TO_BANK' | 'BANK_TO_CASH';

  @IsUUID()
  bankAccountId: string;

  @IsOptional()
  @IsString()
  @MaxLength(150)
  customerName?: string;

  @IsOptional()
  @IsString()
  @MaxLength(30)
  customerPhone?: string;

  @IsOptional()
  @IsString()
  @MaxLength(150)
  counterpartyBank?: string;

  @IsOptional()
  @IsString()
  @MaxLength(100)
  counterpartyAccount?: string;

  @IsInt({ message: 'Số tiền chuyển phải là số nguyên VND' })
  @IsPositive()
  amount: number;

  @IsInt({ message: 'Phí giao dịch phải là số nguyên VND' })
  @Min(0)
  fee: number;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  transferNote?: string;
}

export class ListDomesticTransferQueryDto {
  @IsOptional()
  @IsUUID()
  branchId?: string;
}
