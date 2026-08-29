import { ConflictException } from '@nestjs/common';
import { ApproveExchangeRateUseCase } from './approve-exchange-rate.use-case';
import {
  ExchangeRate,
  ExchangeRateType,
  RateIdentity,
  RateStatus,
  ServiceProvider,
} from '../../../domain/entities/exchange-rate.entity';

const now = new Date('2026-08-21T00:00:00Z');

function draft(id: string, rateType: ExchangeRateType, fromCurrency: 'USD' | 'EUR' = 'USD'): ExchangeRate {
  return {
    id,
    rateType,
    provider: rateType === ExchangeRateType.PAID_BUY || rateType === ExchangeRateType.PAID_SELL
      ? ServiceProvider.WU_MG
      : ServiceProvider.INTERNAL,
    fromCurrency,
    toCurrency: 'VND',
    rate: 26_000,
    margin: rateType === ExchangeRateType.FX_BUY || rateType === ExchangeRateType.FX_SELL ? 500 : 0,
    effectiveFrom: now,
    status: RateStatus.DRAFT,
    createdByUserId: 'creator-id',
    createdAt: now,
    updatedAt: now,
  };
}

describe('ApproveExchangeRateUseCase paired approval', () => {
  const paidBuy = draft('paid-buy', ExchangeRateType.PAID_BUY);
  const paidSell = draft('paid-sell', ExchangeRateType.PAID_SELL);
  const eurBuy = draft('eur-buy', ExchangeRateType.FX_BUY, 'EUR');
  const eurSell = draft('eur-sell', ExchangeRateType.FX_SELL, 'EUR');
  const allRates = [paidBuy, paidSell, eurBuy, eurSell];
  const repository = {
    findById: jest.fn(async (id: string) => allRates.find((rate) => rate.id === id) ?? null),
    findDraftByIdentity: jest.fn(async (identity: RateIdentity) => allRates.find((rate) => (
      rate.rateType === identity.rateType
      && rate.provider === identity.provider
      && rate.fromCurrency === identity.fromCurrency
      && rate.toCurrency === identity.toCurrency
    )) ?? null),
    approveAndSupersedeMany: jest.fn(async (ids: string[]) => (
      ids.map((id) => allRates.find((rate) => rate.id === id)!).filter(Boolean)
    )),
  } as any;
  const useCase = new ApproveExchangeRateUseCase(repository);

  beforeEach(() => jest.clearAllMocks());

  it('automatically approves both sides when one side is selected', async () => {
    await useCase.execute('paid-buy', 'approver-id');

    expect(repository.approveAndSupersedeMany).toHaveBeenCalledWith(
      expect.arrayContaining(['paid-buy', 'paid-sell']),
      'approver-id',
    );
  });

  it('rejects approval when the matching side is missing', async () => {
    repository.findDraftByIdentity.mockResolvedValueOnce(null);

    await expect(useCase.execute('paid-buy', 'approver-id')).rejects.toBeInstanceOf(ConflictException);
    expect(repository.approveAndSupersedeMany).not.toHaveBeenCalled();
  });

  it('sends multiple complete pairs to one atomic repository operation', async () => {
    await useCase.executeMany(['paid-buy', 'eur-buy'], 'approver-id');

    expect(repository.approveAndSupersedeMany).toHaveBeenCalledTimes(1);
    expect(repository.approveAndSupersedeMany).toHaveBeenCalledWith(
      expect.arrayContaining(['paid-buy', 'paid-sell', 'eur-buy', 'eur-sell']),
      'approver-id',
    );
  });
});
