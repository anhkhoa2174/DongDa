// Use Cases: Western Union — Flow WU
// Layer: Application

import { Injectable, Inject, BadRequestException, ConflictException } from '@nestjs/common';
import { IWuRepository, ListWuFilter, WuRecentOptions } from '../../../domain/repositories/wu.repository';
import { IExchangeRateRepository } from '../../../domain/repositories/exchange-rate.repository';
import { WuTransaction, Currency2 } from '../../../domain/entities/wu.entity';
import { ExchangeRateType, ServiceProvider } from '../../../domain/entities/exchange-rate.entity';
import type { CreateWuDto } from '../../dtos/wu/wu.dto';
import { validatePaidAppliedRate } from '../exchange-rate/validate-paid-rate';
import {
  normalizeCountryName,
  normalizeUpperText,
  normalizeUsStateName,
} from '../../../domain/services/wu-reference-data';

@Injectable()
export class CreateWuUseCase {
  constructor(
    @Inject('IWuRepository') private readonly wuRepo: IWuRepository,
    @Inject('IExchangeRateRepository') private readonly rateRepo: IExchangeRateRepository,
  ) {}

  async execute(dto: CreateWuDto, createdByUserId: string): Promise<WuTransaction> {
    if (await this.wuRepo.mtcnExists(dto.mtcn)) {
      throw new ConflictException(`MSKH (MTCN) ${dto.mtcn} đã được xử lý`);
    }
    if (Number(dto.receivedUsd ?? 0) <= 0 && Number(dto.receivedVnd ?? 0) <= 0) {
      throw new BadRequestException('Phải nhập số tiền thực trả cho khách');
    }
    const employmentStatus = requiredOpenText(dto.employmentStatus, 'Nghề nghiệp');
    const senderRelationship = requiredOpenText(dto.senderRelationship, 'Quan hệ với người gửi');
    const receivePurpose = requiredOpenText(dto.receivePurpose, 'Mục đích nhận tiền');
    const nationality = normalizeCountryName(dto.nationality?.trim() || dto.countryOfBirth);
    const identityPlaceOfIssue = normalizeUpperText(requiredOpenText(
      dto.identityPlaceOfIssue ?? dto.identityIssuingCountry,
      'Nơi cấp giấy tờ',
    ));

    const rateType = dto.payoutCurrency === 'VND'
      ? ExchangeRateType.PAID_BUY
      : ExchangeRateType.PAID_SELL;
    const fxRateType = dto.payoutCurrency === 'VND'
      ? ExchangeRateType.FX_BUY
      : ExchangeRateType.FX_SELL;
    const [active, fxRates] = await Promise.all([
      this.rateRepo.findActive({
        rateType,
        provider: ServiceProvider.WU_MG,
        fromCurrency: 'USD',
      }),
      this.rateRepo.findActive({
        rateType: fxRateType,
        provider: ServiceProvider.INTERNAL,
        fromCurrency: 'USD',
      }),
    ]);
    const systemRate = active[0]?.rate;
    if (!systemRate) {
      throw new BadRequestException(`Chưa có tỷ giá ACTIVE ${rateType} cho WU/MG USD`);
    }
    const fxUsdRate = fxRates[0]?.rate;
    if (!fxUsdRate) {
      throw new BadRequestException(`Chưa có tỷ giá ACTIVE ${fxRateType} cho USD`);
    }
    const wuRate = dto.wuUsdAmount > 0 ? dto.wuVndAmount / dto.wuUsdAmount : systemRate;
    const appliedRate = validateAppliedRate(dto.appliedRate, wuRate, systemRate, fxUsdRate);
    assertWuPayoutMatches(dto, appliedRate);

    return this.wuRepo.create({
      branchId: dto.branchId,
      bankAccountId: dto.bankAccountId,
      mtcn: dto.mtcn,
      customerName: dto.customerName,
      customerPhone: dto.customerPhone,
      sendingCountry: normalizeCountryName(dto.sendingCountry),
      senderState: normalizeUsStateName(dto.senderState),
      receiverDateOfBirth: new Date(dto.receiverDateOfBirth),
      currentAddress: dto.currentAddress,
      identityAddress: dto.identityAddress,
      identityDocumentType: dto.identityDocumentType,
      identityDocumentNumber: dto.identityDocumentNumber,
      identityPlaceOfIssue,
      identityIssuingCountry: normalizeCountryName(dto.identityIssuingCountry),
      identityIssueDate: new Date(dto.identityIssueDate),
      identityExpiryDate: new Date(dto.identityExpiryDate),
      hasVisa: dto.hasVisa,
      visaType: dto.hasVisa ? 'TOURIST' : undefined,
      visaNumber: dto.visaNumber,
      visaIssueDate: dto.visaIssueDate ? new Date(dto.visaIssueDate) : undefined,
      visaExpiryDate: dto.visaExpiryDate ? new Date(dto.visaExpiryDate) : undefined,
      employmentStatus,
      countryOfBirth: normalizeCountryName(dto.countryOfBirth),
      nationality,
      senderRelationship,
      receivePurpose,
      senderName: dto.senderName,
      receivedDate: new Date(dto.receivedDate),
      wuUsdAmount: dto.wuUsdAmount,
      wuVndAmount: dto.wuVndAmount,
      receivedUsd: dto.receivedUsd,
      receivedVnd: dto.receivedVnd,
      appliedRate,
      systemRate,
      paidCurrency: dto.paidCurrency as Currency2,
      payoutCurrency: dto.payoutCurrency as Currency2,
      createdByUserId,
    });
  }
}

function requiredOpenText(value: string, label: string): string {
  const normalized = value?.trim();
  if (!normalized) throw new BadRequestException(`${label} không được để trống`);
  return normalized;
}

@Injectable()
export class ListWuUseCase {
  constructor(@Inject('IWuRepository') private readonly wuRepo: IWuRepository) {}
  execute(filter?: ListWuFilter): Promise<WuTransaction[]> {
    return this.wuRepo.list(filter);
  }
  findById(id: string): Promise<WuTransaction | null> {
    return this.wuRepo.findById(id);
  }
  recentOptions(branchId?: string): Promise<WuRecentOptions> {
    return this.wuRepo.recentOptions(branchId);
  }
}

export function validateAppliedRate(value: number, firstRate: number, secondRate: number, thirdRate?: number) {
  return validatePaidAppliedRate(value, firstRate, secondRate, 'WU', thirdRate);
}

export function assertWuPayoutMatches(dto: CreateWuDto, appliedRate: number) {
  const receivedUsd = Number(dto.receivedUsd ?? 0);
  const receivedVnd = Number(dto.receivedVnd ?? 0);
  const wuUsd = Number(dto.wuUsdAmount ?? 0);

  if (receivedUsd > 0 && !Number.isInteger(receivedUsd)) {
    throw new BadRequestException('WU: USD thực trả phải là số nguyên, phần lẻ sau dấu . quy đổi sang VND');
  }

  if (dto.payoutCurrency === 'VND') {
    if (receivedUsd > 0) {
      throw new BadRequestException('WU: khách nhận VND thì không được ghi USD thực trả');
    }
    if (receivedVnd <= 0) {
      throw new BadRequestException('WU: khách nhận VND thì phải nhập số VND thực trả');
    }
    const expectedVnd = dto.paidCurrency === 'VND'
      ? Math.round(Number(dto.wuVndAmount))
      : Math.round(wuUsd * appliedRate);
    if (Math.abs(receivedVnd - expectedVnd) > 1) {
      const calculation = dto.paidCurrency === 'VND'
        ? 'Amount VND của WU'
        : 'Amount USD nhân tỷ giá áp dụng';
      throw new BadRequestException(`WU: VND thực trả phải bằng ${calculation} (${expectedVnd} VND)`);
    }
    return;
  }

  const maxReceivedUsd = Math.trunc(Math.max(wuUsd, 0));
  if (receivedUsd < 0 || receivedUsd > maxReceivedUsd) {
    throw new BadRequestException(`WU: USD thực trả phải nằm trong khoảng 0 - ${maxReceivedUsd} USD`);
  }
  const convertedUsd = Math.max(wuUsd - receivedUsd, 0);
  const expectedVnd = Math.round(convertedUsd * appliedRate);
  if (Math.abs(receivedVnd - expectedVnd) > 1) {
    throw new BadRequestException(`WU: VND thực trả phải bằng phần USD còn lại quy đổi theo tỷ giá (${expectedVnd} VND)`);
  }
}
