import { BadRequestException, ConflictException } from '@nestjs/common';
import { CreateExchangeRateUseCase } from './create-exchange-rate.use-case';
import { ExchangeRateType, ServiceProvider } from '../../../domain/entities/exchange-rate.entity';

describe('CreateExchangeRateUseCase margin rules', () => {
  const repository = {
    create: jest.fn(async (data) => data),
    createMany: jest.fn(async (data) => data),
    findDraftByIdentity: jest.fn(async () => null),
  } as any;
  const useCase = new CreateExchangeRateUseCase(repository);

  beforeEach(() => jest.clearAllMocks());

  it('keeps an FX margin and forces Paid margin to zero', async () => {
    await useCase.execute({
      rateType: ExchangeRateType.FX_BUY,
      provider: ServiceProvider.INTERNAL,
      fromCurrency: 'EUR',
      rate: 28_000,
      margin: 500,
    }, 'user-id');
    expect(repository.create).toHaveBeenCalledWith(expect.objectContaining({ margin: 500 }));

    await useCase.execute({
      rateType: ExchangeRateType.PAID_BUY,
      fromCurrency: 'USD',
      rate: 26_000,
      margin: 500,
    }, 'user-id');
    expect(repository.create).toHaveBeenLastCalledWith(expect.objectContaining({ margin: 0 }));
  });

  it('rejects different margins for the buy and sell side of one FX pair', async () => {
    await expect(useCase.executeBatch({ rates: [
      { rateType: ExchangeRateType.FX_BUY, fromCurrency: 'EUR', rate: 28_000, margin: 500 },
      { rateType: ExchangeRateType.FX_SELL, fromCurrency: 'EUR', rate: 29_000, margin: 400 },
    ] }, 'user-id')).rejects.toBeInstanceOf(BadRequestException);
    expect(repository.createMany).not.toHaveBeenCalled();
  });

  it('rejects duplicate identities inside one batch', async () => {
    await expect(useCase.executeBatch({ rates: [
      { rateType: ExchangeRateType.PAID_BUY, fromCurrency: 'USD', rate: 26_000 },
      { rateType: ExchangeRateType.PAID_BUY, fromCurrency: 'USD', rate: 26_100 },
    ] }, 'user-id')).rejects.toBeInstanceOf(BadRequestException);
    expect(repository.createMany).not.toHaveBeenCalled();
  });

  it('rejects an identity that already has a pending draft', async () => {
    repository.findDraftByIdentity.mockResolvedValueOnce({ id: 'existing-rate' });
    await expect(useCase.execute({
      rateType: ExchangeRateType.PAID_BUY,
      fromCurrency: 'USD',
      rate: 26_000,
    }, 'user-id')).rejects.toBeInstanceOf(ConflictException);
    expect(repository.create).not.toHaveBeenCalled();
  });
});
