import { Logger, ServiceUnavailableException } from '@nestjs/common';
import axios from 'axios';
import { GeminiExchangeRateParserService } from './gemini-exchange-rate-parser.service';

jest.mock('axios');
const post = axios.post as jest.Mock;

const API_KEY = 'AQ.secret-api-key-value';
const input = { bytes: Buffer.from('fake-image'), mimeType: 'image/png', fileName: 'rate.png' } as any;
const ratesResponse = {
  data: { candidates: [{ content: { parts: [{ text: JSON.stringify({ rates: [
    { rateType: 'FX_BUY', provider: 'INTERNAL', fromCurrency: 'EUR', rate: 28100, confidence: 0.95, sourceLabel: 'EUR mua' },
  ] }) }] } }] },
};
const httpError = (status: number) => ({ response: { status } });

function makeService(env: Record<string, string> = {}) {
  const values: Record<string, string> = { GEMINI_API_KEY: API_KEY, ...env };
  return new GeminiExchangeRateParserService({ get: (k: string) => values[k] } as any);
}

async function parseWithFakeClock(service: GeminiExchangeRateParserService) {
  const settled = service.parse(input).then((value) => ({ value }), (error) => ({ error }));
  await jest.advanceTimersByTimeAsync(30_000);
  return settled;
}

describe('GeminiExchangeRateParserService — thử lại khi Gemini lỗi tạm thời', () => {
  beforeEach(() => { jest.useFakeTimers(); post.mockReset(); });
  afterEach(() => { jest.useRealTimers(); jest.restoreAllMocks(); });

  it('thử lại khi Google quá tải 503 rồi trả kết quả khi lần sau thành công', async () => {
    post.mockRejectedValueOnce(httpError(503)).mockResolvedValueOnce(ratesResponse);

    const result: any = await parseWithFakeClock(makeService());

    expect(result.error).toBeUndefined();
    expect(result.value).toHaveLength(1);
    expect(result.value[0]).toMatchObject({ fromCurrency: 'EUR', rate: 28100 });
    expect(post).toHaveBeenCalledTimes(2);
  });

  it('bỏ cuộc sau 3 lần và báo lỗi máy chủ Gemini', async () => {
    post.mockRejectedValue(httpError(503));

    const result: any = await parseWithFakeClock(makeService());

    expect(result.error).toBeInstanceOf(ServiceUnavailableException);
    expect(post).toHaveBeenCalledTimes(3);
  });

  it('không thử lại khi key bị từ chối (403)', async () => {
    post.mockRejectedValue(httpError(403));

    const result: any = await parseWithFakeClock(makeService());

    expect(result.error).toBeInstanceOf(ServiceUnavailableException);
    expect(post).toHaveBeenCalledTimes(1);
  });

  it('ghi log thử lại có mã lỗi, không lộ API key', async () => {
    const warn = jest.spyOn(Logger.prototype, 'warn').mockImplementation(() => undefined);
    post.mockRejectedValueOnce(httpError(429)).mockResolvedValueOnce(ratesResponse);

    await parseWithFakeClock(makeService());

    const messages = warn.mock.calls.map((call) => String(call[0]));
    expect(messages.some((m) => m.includes('status=429') && /thử lại|retry/i.test(m))).toBe(true);
    expect(messages.join('\n')).not.toContain(API_KEY);
  });

  it('dùng model còn hoạt động khi không đặt GEMINI_MODEL', async () => {
    post.mockResolvedValueOnce(ratesResponse);

    await parseWithFakeClock(makeService());

    expect(post.mock.calls[0][0]).toContain('/models/gemini-3.5-flash:generateContent');
  });
});
