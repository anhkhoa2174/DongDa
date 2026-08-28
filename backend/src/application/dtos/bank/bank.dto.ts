// DTOs: Ngân hàng
// Layer: Application

import { IsUUID, IsNumber, IsPositive, IsOptional, IsString, MaxLength } from 'class-validator';

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

// Updated: ghi nhận số CK hằng ngày để cuối ngày dùng Tài khoản chính thanh toán lại
export class RecordAdvanceCkDto {
  @IsUUID()
  bankAccountId: string;

  @IsUUID()
  branchId: string;

  @IsNumber({ maxDecimalPlaces: 2 })
  @IsPositive()
  amount: number;

  @IsString()
  @MaxLength(500)
  description: string; // Ghi rõ mục đích CK
}

// Hoàn lại tạm ứng CK
export class SettleAdvanceCkDto {
  @IsUUID()
  advanceMovementId: string; // ID movement ADVANCE_CK cần hoàn

  @IsUUID()
  bankAccountId: string;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  note?: string;
}

