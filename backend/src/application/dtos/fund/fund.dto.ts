// DTOs: Quỹ & Điều chuyển
// Layer: Application

import {
  ArrayMaxSize, ArrayMinSize, ArrayUnique, IsEnum, IsOptional, IsNumber, IsPositive,
  IsUUID, ValidateNested, IsIn, IsString, MaxLength, IsDateString, Min,
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
  @ArrayUnique((item: CreateTransferItemDto) => item.currencyCode, { message: 'Mỗi loại tiền chỉ được thêm một lần trong phiếu tiếp quỹ' })
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
  @ArrayUnique((item: CreateCentralFundMovementItemDto) => item.currencyCode, { message: 'Mỗi loại tiền chỉ được thêm một lần trong phiếu thu/chi' })
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

  @IsNumber({ maxDecimalPlaces: 6 })
  @IsPositive()
  rate: number;

  @IsNumber({ maxDecimalPlaces: 0 })
  @Min(0)
  deduction: number;
}

export class ConvertCentralFundDto {
  @ArrayMinSize(1, { message: 'Phiếu quy đổi phải có ít nhất một loại ngoại tệ' })
  @ArrayMaxSize(18, { message: 'Phiếu quy đổi có tối đa 18 loại ngoại tệ' })
  @ArrayUnique((item: ConvertCentralFundItemDto) => item.currencyCode, { message: 'Mỗi loại ngoại tệ chỉ được thêm một lần trong phiếu quy đổi' })
  @ValidateNested({ each: true })
  @Type(() => ConvertCentralFundItemDto)
  items: ConvertCentralFundItemDto[];

  @IsOptional()
  @IsString()
  @MaxLength(1000)
  note?: string;
}
