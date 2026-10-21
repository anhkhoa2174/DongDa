import { Logger, ServiceUnavailableException } from '@nestjs/common';
import axios from 'axios';
import { GeminiJournalParserService } from './gemini-journal-parser.service';

jest.mock('axios');
const post = axios.post as jest.Mock;

const API_KEY = 'AQ.secret-api-key-value';
const input = { bytes: Buffer.from('%PDF-fake'), fileName: 'wu.pdf', provider: 'WU' as const };
const rowsResponse = {
  data: { candidates: [{ content: { parts: [{ text: JSON.stringify({ rows: [
    { code: '4402801610', amount: 1000, currencyCode: 'USD', customerName: 'VO THI BACH TUYET' },
  ] }) }] } }] },
};
const httpError = (status: number) => ({ response: { status } });

function makeService(env: Record<string, string> = {}) {
  const values: Record<string, string> = { GEMINI_API_KEY: API_KEY, ...env };
  return new GeminiJournalParserService({ get: (k: string) => values[k] } as any);
}

// Chạy parse() với đồng hồ giả để không phải chờ thật 2s + 4s giữa các lần thử.
async function parseWithFakeClock(service: GeminiJournalParserService) {
  const promise = service.parse(input);
  const settled = promise.then((value) => ({ value }), (error) => ({ error }));
  await jest.advanceTimersByTimeAsync(30_000);
  return settled;
}

describe('GeminiJournalParserService — thử lại khi Gemini lỗi tạm thời', () => {
  beforeEach(() => {
    jest.useFakeTimers();
    post.mockReset();
  });
  afterEach(() => {
    jest.useRealTimers();
    jest.restoreAllMocks();
  });

  it('thử lại khi Google quá tải 503 rồi trả đủ dòng khi lần sau thành công', async () => {
    post.mockRejectedValueOnce(httpError(503)).mockResolvedValueOnce(rowsResponse);

    const result: any = await parseWithFakeClock(makeService());

    expect(result.error).toBeUndefined();
    expect(result.value).toEqual([
      { code: '4402801610', amount: 1000, currencyCode: 'USD', customerName: 'VO THI BACH TUYET' },
    ]);
    expect(post).toHaveBeenCalledTimes(2);
  });

  it('thử lại khi vượt giới hạn tốc độ 429', async () => {
    post.mockRejectedValueOnce(httpError(429)).mockResolvedValueOnce(rowsResponse);

    const result: any = await parseWithFakeClock(makeService());

    expect(result.value).toHaveLength(1);
    expect(post).toHaveBeenCalledTimes(2);
  });

  it('bỏ cuộc sau 3 lần và báo lỗi máy chủ Gemini rõ ràng', async () => {
    post.mockRejectedValue(httpError(503));

    const result: any = await parseWithFakeClock(makeService());

    expect(result.error).toBeInstanceOf(ServiceUnavailableException);
    expect(result.error.message).toContain('lỗi máy chủ');
    expect(post).toHaveBeenCalledTimes(3);
  });

  it.each([400, 401, 403])('không thử lại khi HTTP %s (key/nội dung sai, thử lại cũng vô ích)', async (status) => {
    post.mockRejectedValue(httpError(status));

    const result: any = await parseWithFakeClock(makeService());

    expect(result.error).toBeDefined();
    expect(post).toHaveBeenCalledTimes(1);
  });

  it('không thử lại khi hết thời gian chờ của chính mình (đã chờ trọn 90 giây)', async () => {
    post.mockRejectedValue({ code: 'ECONNABORTED' });

    const result: any = await parseWithFakeClock(makeService());

    expect(result.error).toBeDefined();
    expect(post).toHaveBeenCalledTimes(1);
  });

  it('ghi log mỗi lần thử lại có mã lỗi nhưng không lộ API key', async () => {
    const warn = jest.spyOn(Logger.prototype, 'warn').mockImplementation(() => undefined);
    post.mockRejectedValueOnce(httpError(503)).mockResolvedValueOnce(rowsResponse);

    await parseWithFakeClock(makeService());

    const messages = warn.mock.calls.map((call) => String(call[0]));
    expect(messages.some((m) => m.includes('status=503') && /thử lại|retry/i.test(m))).toBe(true);
    expect(messages.join('\n')).not.toContain(API_KEY);
  });

  it('dùng model còn hoạt động khi không đặt GEMINI_MODEL (2.5-flash đã ngừng cho user mới)', async () => {
    post.mockResolvedValueOnce(rowsResponse);

    await parseWithFakeClock(makeService());

    expect(post.mock.calls[0][0]).toContain('/models/gemini-3.5-flash:generateContent');
  });

  it('ưu tiên GEMINI_MODEL khi có đặt', async () => {
    post.mockResolvedValueOnce(rowsResponse);

    await parseWithFakeClock(makeService({ GEMINI_MODEL: 'gemini-3.8-flash' }));

    expect(post.mock.calls[0][0]).toContain('/models/gemini-3.8-flash:generateContent');
  });
});
