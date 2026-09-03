import {
  IsEnum,
  IsInt,
  IsNotEmpty,
  IsOptional,
  IsPositive,
  IsString,
  IsUUID,
  MaxLength,
  Min,
  ValidateIf,
} from 'class-validator';

export class CreateDomesticTransferDto {
  @IsUUID()
  branchId: string;

  @IsEnum(['CASH_TO_BANK', 'BANK_TO_CASH'] as any, {
    message: 'Loại giao dịch phải là CASH_TO_BANK hoặc BANK_TO_CASH',
  })
  transferType: 'CASH_TO_BANK' | 'BANK_TO_CASH';

  @IsUUID()
  bankAccountId: string;

  @ValidateIf((dto: CreateDomesticTransferDto) => dto.transferType === 'CASH_TO_BANK' || dto.customerName !== undefined)
  @IsString()
  @IsNotEmpty()
  @MaxLength(150)
  customerName?: string;

  @IsOptional()
  @IsString()
  @MaxLength(30)
  customerPhone?: string;

  @ValidateIf((dto: CreateDomesticTransferDto) => dto.transferType === 'CASH_TO_BANK' || dto.counterpartyBank !== undefined)
  @IsString()
  @IsNotEmpty()
  @MaxLength(150)
  counterpartyBank?: string;

  @ValidateIf((dto: CreateDomesticTransferDto) => dto.transferType === 'CASH_TO_BANK' || dto.counterpartyAccount !== undefined)
  @IsString()
  @IsNotEmpty()
  @MaxLength(100)
  counterpartyAccount?: string;

  @IsString()
  @MaxLength(100)
  transferReference: string;

  @IsInt({ message: 'Số tiền chuyển phải là số nguyên VND' })
  @IsPositive()
  amount: number;

  @IsInt({ message: 'Phí giao dịch phải là số nguyên VND' })
  @Min(0)
  fee: number;

  @IsEnum(['CASH', 'BANK'] as any, {
    message: 'Nguồn thu phí phải là CASH hoặc BANK',
  })
  feePaymentMethod: 'CASH' | 'BANK';

  @IsString()
  @MaxLength(500)
  transferNote?: string;
}

export class ListDomesticTransferQueryDto {
  @IsOptional()
  @IsUUID()
  branchId?: string;
}
