import { ServiceUnavailableException } from '@nestjs/common';
import { geminiApiException, sanitizeGeminiRates } from './gemini-exchange-rate-parser.service';

describe('sanitizeGeminiRates', () => {
  it('keeps valid business mappings and removes duplicates by confidence', () => {
    const rates = sanitizeGeminiRates([
      { rateType: 'FX_BUY', provider: 'INTERNAL', fromCurrency: 'eur', rate: 28000, confidence: 0.7, sourceLabel: 'EUR mua' },
      { rateType: 'FX_BUY', provider: 'INTERNAL', fromCurrency: 'EUR', rate: 28100, confidence: 0.95, sourceLabel: 'EUR mua rõ' },
    ]);
    expect(rates).toHaveLength(1);
    expect(rates[0]).toMatchObject({ fromCurrency: 'EUR', rate: 28100, confidence: 0.95 });
  });

  it('rejects invalid provider mappings and non-positive rates', () => {
    expect(sanitizeGeminiRates([
      { rateType: 'PAID_BUY', provider: 'INTERNAL', fromCurrency: 'USD', rate: 26000, confidence: 1, sourceLabel: 'invalid' },
      { rateType: 'FX_SELL', provider: 'INTERNAL', fromCurrency: 'EUR', rate: -1, confidence: 1, sourceLabel: 'invalid' },
    ])).toEqual([]);
  });
});

describe('geminiApiException', () => {
  it('does not expose provider error details or API keys', () => {
    const exception = geminiApiException({
      response: { status: 403, data: { error: { message: 'Permission denied for secret-key-value' } } },
    });
    expect(exception).toBeInstanceOf(ServiceUnavailableException);
    expect(exception.message).not.toContain('secret-key-value');
  });
});
