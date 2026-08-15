// DTOs: Quỹ & Điều chuyển
// Layer: Application

import {
  ArrayMaxSize, ArrayMinSize, IsEnum, IsOptional, IsNumber, IsPositive,
  IsUUID, ValidateNested, IsIn, IsString, MaxLength, IsDateString,
} from 'class-validator';
import { Type } from 'class-transformer';
import { SUPPORTED_CURRENCIES } from '../../../domain/entities/currency';

const CURRENCIES = [...SUPPORTED_CURRENCIES];

export class CreateTransferItemDto {
  @IsEnum(CURRENCIES as any, { message: 'currency không hợp lệ' })
  currencyCode: string;

  @IsNumber({ maxDecimalPlaces: 2 })
  @IsPositive()
  amount: number;
}

export class CreateTransferDto {
  @IsUUID()
  destinationBranchId: string;

  @ArrayMinSize(1, { message: 'Phiếu tiếp quỹ phải có ít nhất một loại tiền' })
  @ArrayMaxSize(20, { message: 'Phiếu tiếp quỹ có tối đa 20 loại tiền' })
  @ValidateNested({ each: true })
  @Type(() => CreateTransferItemDto)
  items: CreateTransferItemDto[];
}

export class ListTransfersQueryDto {
  @IsOptional()
  @IsUUID()
  branchId?: string;

  @IsOptional()
  status?: string;
}

export class ListFundMovementHistoryQueryDto {
  @IsOptional()
  @IsUUID()
  branchId?: string;

  @IsOptional()
  @IsDateString()
  dateFrom?: string;

  @IsOptional()
  @IsDateString()
  dateTo?: string;
}

export class CreateCentralFundMovementItemDto {
  @IsEnum(CURRENCIES as any, { message: 'currency không hợp lệ' })
  currencyCode: string;

  @IsNumber({ maxDecimalPlaces: 2 })
  @IsPositive()
  amount: number;

  @IsOptional()
  @IsUUID()
  bankAccountId?: string;
}

export class CreateCentralFundMovementDto {
  @IsIn(['IN', 'OUT'])
  direction: 'IN' | 'OUT';

  @IsIn(['CASH', 'BANK'])
  sourceType: 'CASH' | 'BANK';

  @ArrayMinSize(1, { message: 'Phiếu phải có ít nhất một khoản tiền' })
  @ArrayMaxSize(20, { message: 'Phiếu có tối đa 20 khoản tiền' })
  @ValidateNested({ each: true })
  @Type(() => CreateCentralFundMovementItemDto)
  items: CreateCentralFundMovementItemDto[];

  @IsOptional()
  @IsString()
  @MaxLength(1000)
  note?: string;
}

export class ConvertCentralFundItemDto {
  @IsIn(CURRENCIES.filter((currency) => currency !== 'VND' && currency !== 'USD'))
  currencyCode: string;

  @IsNumber({ maxDecimalPlaces: 2 })
  @IsPositive()
  amount: number;
}

export class ConvertCentralFundDto {
  @ArrayMinSize(1, { message: 'Phiếu quy đổi phải có ít nhất một loại ngoại tệ' })
  @ArrayMaxSize(18, { message: 'Phiếu quy đổi có tối đa 18 loại ngoại tệ' })
  @ValidateNested({ each: true })
  @Type(() => ConvertCentralFundItemDto)
  items: ConvertCentralFundItemDto[];

  @IsOptional()
  @IsString()
  @MaxLength(1000)
  note?: string;
}
