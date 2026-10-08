import { BadGatewayException, GatewayTimeoutException, ServiceUnavailableException } from '@nestjs/common';
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
  it.each(['ECONNABORTED', 'ETIMEDOUT'])('reports timeout %s as 504', (code) => {
    const exception = geminiApiException({ code });
    expect(exception).toBeInstanceOf(GatewayTimeoutException);
    expect(exception.getStatus()).toBe(504);
  });

  it.each(['ENOTFOUND', 'EAI_AGAIN', 'ECONNREFUSED', 'ECONNRESET'])('reports connection failure %s as 503', (code) => {
    const exception = geminiApiException({ code });
    expect(exception).toBeInstanceOf(ServiceUnavailableException);
    expect(exception.message).toContain('DNS');
  });

  it.each([500, 502, 503, 504])('reports upstream %s as service unavailable', (status) => {
    const exception = geminiApiException({ response: { status } });
    expect(exception).toBeInstanceOf(ServiceUnavailableException);
    expect(exception.message).toContain('lỗi máy chủ');
  });

  it('distinguishes invalid JSON without exposing response content', () => {
    const exception = geminiApiException(new SyntaxError('secret response content'));
    expect(exception).toBeInstanceOf(BadGatewayException);
    expect(exception.message).toContain('JSON');
    expect(exception.message).not.toContain('secret response content');
  });

  it('does not expose provider error details or API keys', () => {
    const exception = geminiApiException({
      response: { status: 403, data: { error: { message: 'Permission denied for secret-key-value' } } },
    });
    expect(exception).toBeInstanceOf(ServiceUnavailableException);
    expect(exception.message).not.toContain('secret-key-value');
  });
});
