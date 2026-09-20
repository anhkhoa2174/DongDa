import 'reflect-metadata';
import { validate } from 'class-validator';
import { ConvertCentralFundItemDto } from './fund.dto';

describe('ConvertCentralFundItemDto', () => {
  it.each(['USD', 'EUR'])('accepts %s for central foreign-currency trading', async (currencyCode) => {
    const dto = Object.assign(new ConvertCentralFundItemDto(), {
      currencyCode,
      amount: 10.25,
      rate: 25_500,
      deduction: 0,
    });

    await expect(validate(dto)).resolves.toHaveLength(0);
  });

  it('rejects VND because it is the settlement currency', async () => {
    const dto = Object.assign(new ConvertCentralFundItemDto(), {
      currencyCode: 'VND',
      amount: 10,
      rate: 1,
      deduction: 0,
    });

    const errors = await validate(dto);
    expect(errors.some((error) => error.property === 'currencyCode')).toBe(true);
  });
});
