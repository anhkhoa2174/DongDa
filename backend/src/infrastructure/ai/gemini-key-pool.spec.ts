import { Logger, ServiceUnavailableException } from '@nestjs/common';
import {
  classifyGeminiKeyFailure, GeminiKeyPool, GeminiKeysExhaustedException, parseGeminiDurationMs,
} from './gemini-key-pool';

const PRIMARY = 'AQ.free-primary-key-secret';
const FALLBACK = 'AQ.paid-fallback-key-secret';
const MODEL = 'gemini-3.5-flash';

// Đúng hình dạng lỗi Google trả khi key free hết 20 request/ngày (lấy từ lỗi thật trên TEST).
const dayQuota = (retryDelay?: string) => ({
  response: {
    status: 429,
    data: { error: {
      code: 429,
      status: 'RESOURCE_EXHAUSTED',
      message: 'You exceeded your current quota, please check your plan and billing details. * Quota exceeded for metric: generativelanguage.googleapis.com/generate_content_free_tier_requests, limit: 20',
      details: [
        { '@type': 'type.googleapis.com/google.rpc.QuotaFailure',
          violations: [{ quotaId: 'GenerateRequestsPerDayPerProjectPerModel-FreeTier' }] },
        ...(retryDelay ? [{ '@type': 'type.googleapis.com/google.rpc.RetryInfo', retryDelay }] : []),
      ],
    } },
  },
});
const minuteQuota = (retryDelay?: string) => ({
  response: {
    status: 429,
    data: { error: {
      status: 'RESOURCE_EXHAUSTED',
      message: 'You exceeded your current quota',
      details: [
        { '@type': 'type.googleapis.com/google.rpc.QuotaFailure',
          violations: [{ quotaId: 'GenerateRequestsPerMinutePerProjectPerModel-FreeTier' }] },
        ...(retryDelay ? [{ '@type': 'type.googleapis.com/google.rpc.RetryInfo', retryDelay }] : []),
      ],
    } },
  },
});
const http = (status: number) => ({ response: { status } });

function makePool(env: Record<string, string | undefined> = { GEMINI_API_KEY: PRIMARY, GEMINI_API_KEY_FALLBACK: FALLBACK }) {
  return new GeminiKeyPool({ get: (k: string) => env[k] } as any);
}

/** call giả: trả về theo từng key. */
function byKey(handlers: Record<string, () => Promise<any>>) {
  return jest.fn((apiKey: string) => handlers[apiKey]());
}

const ok = (v = 'ok') => () => Promise.resolve(v);
const fail = (e: any) => () => Promise.reject(e);

describe('classifyGeminiKeyFailure', () => {
  it('429 hết hạn mức NGÀY (quotaId PerDay) -> quota-day, đọc retryDelay', () => {
    expect(classifyGeminiKeyFailure(dayQuota('3600s'))).toEqual({ kind: 'quota-day', retryAfterMs: 3_600_000 });
  });

  it('429 hết hạn mức PHÚT -> quota-minute', () => {
    expect(classifyGeminiKeyFailure(minuteQuota('20s'))).toEqual({ kind: 'quota-minute', retryAfterMs: 20_000 });
  });

  it('lấy thời gian chờ từ câu "Please retry in ..." khi không có RetryInfo', () => {
    const e: any = dayQuota();
    e.response.data.error.message += '\nPlease retry in 16h31m9.5s.';
    expect(classifyGeminiKeyFailure(e)).toEqual({ kind: 'quota-day', retryAfterMs: (16 * 3600 + 31 * 60 + 9.5) * 1000 });
  });

  it('429 không rõ loại -> coi như theo phút', () => {
    expect(classifyGeminiKeyFailure(http(429))).toEqual({ kind: 'quota-minute', retryAfterMs: undefined });
  });

  it('429 vì chạm trần chi tiêu (spending cap) -> credit', () => {
    const e = { response: { status: 429, data: { error: { message: 'Your project has exceeded its monthly spending cap' } } } };
    expect(classifyGeminiKeyFailure(e).kind).toBe('credit');
  });

  it('402 hết số dư trả trước -> credit', () => {
    expect(classifyGeminiKeyFailure(http(402)).kind).toBe('credit');
  });

  it.each([401, 403])('%s -> auth (key sai / project bị chặn)', (status) => {
    expect(classifyGeminiKeyFailure(http(status)).kind).toBe('auth');
  });

  it('400 API_KEY_INVALID (Google trả 400 khi key sai) -> auth', () => {
    const e = { response: { status: 400, data: { error: { status: 'INVALID_ARGUMENT', message: 'API key not valid. Please pass a valid API key.',
      details: [{ '@type': 'type.googleapis.com/google.rpc.ErrorInfo', reason: 'API_KEY_INVALID' }] } } } };
    expect(classifyGeminiKeyFailure(e).kind).toBe('auth');
  });

  it.each([400, 404, 500, 503])('%s -> other (không phải lỗi của key, đổi key không giúp)', (status) => {
    expect(classifyGeminiKeyFailure(http(status)).kind).toBe('other');
  });

  it('lỗi mạng -> other', () => {
    expect(classifyGeminiKeyFailure({ code: 'ECONNRESET' }).kind).toBe('other');
  });
});

describe('parseGeminiDurationMs', () => {
  it.each([
    ['59s', 59_000], ['3.5s', 3_500], ['16h31m9.5s', 59_469_500], ['2m', 120_000], ['1h', 3_600_000], ['9s.', 9_000],
  ])('%s -> %s ms', (text, ms) => {
    expect(parseGeminiDurationMs(text)).toBe(ms);
  });

  it.each(['', 'abc', undefined, null, 42])('không đọc được %p -> undefined', (text) => {
    expect(parseGeminiDurationMs(text)).toBeUndefined();
  });
});

describe('GeminiKeyPool — key chính (free) trước, key dự phòng (trả phí) khi key chính hết', () => {
  beforeEach(() => {
    jest.useFakeTimers();
    jest.setSystemTime(new Date('2026-11-07T03:00:00Z'));
  });
  afterEach(() => {
    jest.useRealTimers();
    jest.restoreAllMocks();
  });

  it('key chính còn dùng được: chỉ dùng key chính, không đụng key dự phòng (không tốn tiền)', async () => {
    const pool = makePool();
    const call = byKey({ [PRIMARY]: ok('A'), [FALLBACK]: ok('B') });

    await expect(pool.run(MODEL, call)).resolves.toBe('A');

    expect(call.mock.calls.map((c) => c[0])).toEqual([PRIMARY]);
  });

  it('key chính hết hạn mức ngày: chuyển NGAY sang key dự phòng trong cùng request, không chờ', async () => {
    const pool = makePool();
    const call = byKey({ [PRIMARY]: fail(dayQuota('3600s')), [FALLBACK]: ok('B') });

    await expect(pool.run(MODEL, call)).resolves.toBe('B');

    expect(call.mock.calls.map((c) => c[0])).toEqual([PRIMARY, FALLBACK]);
    expect(jest.getTimerCount()).toBe(0); // không có lần chờ nào
  });

  it('request sau đi thẳng key dự phòng, không gọi lại key chính đang hết hạn mức', async () => {
    const pool = makePool();
    await pool.run(MODEL, byKey({ [PRIMARY]: fail(dayQuota('3600s')), [FALLBACK]: ok() }));

    const call = byKey({ [PRIMARY]: ok('A'), [FALLBACK]: ok('B') });
    await expect(pool.run(MODEL, call)).resolves.toBe('B');

    expect(call.mock.calls.map((c) => c[0])).toEqual([FALLBACK]);
  });

  it('hết thời gian Google báo (retryDelay) thì tự quay về key chính (miễn phí)', async () => {
    const pool = makePool();
    await pool.run(MODEL, byKey({ [PRIMARY]: fail(dayQuota('3600s')), [FALLBACK]: ok() }));

    jest.setSystemTime(Date.now() + 3_600_001);
    const call = byKey({ [PRIMARY]: ok('A'), [FALLBACK]: ok('B') });
    await expect(pool.run(MODEL, call)).resolves.toBe('A');

    expect(call.mock.calls.map((c) => c[0])).toEqual([PRIMARY]);
  });

  it('không có retryDelay: thử lại key chính sau 1 giờ', async () => {
    const pool = makePool();
    await pool.run(MODEL, byKey({ [PRIMARY]: fail(dayQuota()), [FALLBACK]: ok() }));

    jest.setSystemTime(Date.now() + 59 * 60_000);
    const before = byKey({ [PRIMARY]: ok('A'), [FALLBACK]: ok('B') });
    await expect(pool.run(MODEL, before)).resolves.toBe('B');

    jest.setSystemTime(Date.now() + 2 * 60_000);
    const after = byKey({ [PRIMARY]: ok('A'), [FALLBACK]: ok('B') });
    await expect(pool.run(MODEL, after)).resolves.toBe('A');
  });

  it('hạn mức tính theo model: key chính hết ở model này vẫn dùng được cho model khác', async () => {
    const pool = makePool();
    await pool.run(MODEL, byKey({ [PRIMARY]: fail(dayQuota('3600s')), [FALLBACK]: ok() }));

    const call = byKey({ [PRIMARY]: ok('A'), [FALLBACK]: ok('B') });
    await expect(pool.run('gemini-3.8-flash', call)).resolves.toBe('A');
  });

  it('hết hạn mức theo phút: chỉ dùng key dự phòng trong thời gian ngắn rồi quay lại', async () => {
    const pool = makePool();
    await pool.run(MODEL, byKey({ [PRIMARY]: fail(minuteQuota('20s')), [FALLBACK]: ok() }));

    jest.setSystemTime(Date.now() + 10_000);
    await expect(pool.run(MODEL, byKey({ [PRIMARY]: ok('A'), [FALLBACK]: ok('B') }))).resolves.toBe('B');

    jest.setSystemTime(Date.now() + 11_000);
    await expect(pool.run(MODEL, byKey({ [PRIMARY]: ok('A'), [FALLBACK]: ok('B') }))).resolves.toBe('A');
  });

  it.each([402, 401, 403])('key chính lỗi %s (hết số dư / key hỏng): chuyển sang key dự phòng', async (status) => {
    const pool = makePool();
    const call = byKey({ [PRIMARY]: fail(http(status)), [FALLBACK]: ok('B') });

    await expect(pool.run(MODEL, call)).resolves.toBe('B');
    expect(call.mock.calls.map((c) => c[0])).toEqual([PRIMARY, FALLBACK]);
  });

  it('Google quá tải 503: thử lại trên key chính, KHÔNG chuyển key trả phí', async () => {
    const pool = makePool();
    let n = 0;
    const call = jest.fn((apiKey: string) => (apiKey === PRIMARY && n++ === 0 ? Promise.reject(http(503)) : Promise.resolve(apiKey)));

    const settled = pool.run(MODEL, call, { random: () => 0 });
    await jest.advanceTimersByTimeAsync(10_000);

    await expect(settled).resolves.toBe(PRIMARY);
    expect(call.mock.calls.map((c) => c[0])).toEqual([PRIMARY, PRIMARY]);
  });

  it('lỗi 400 (nội dung sai): ném lỗi gốc, không thử key dự phòng', async () => {
    const pool = makePool();
    const err = http(400);
    const call = byKey({ [PRIMARY]: fail(err), [FALLBACK]: ok('B') });

    await expect(pool.run(MODEL, call)).rejects.toBe(err);
    expect(call).toHaveBeenCalledTimes(1);
  });

  it('cả 2 key đều hết: báo GeminiKeysExhaustedException, không thử lại 429 ngày', async () => {
    const pool = makePool();
    const call = byKey({ [PRIMARY]: fail(dayQuota('3600s')), [FALLBACK]: fail(http(402)) });

    await expect(pool.run(MODEL, call)).rejects.toBeInstanceOf(GeminiKeysExhaustedException);
    expect(call.mock.calls.map((c) => c[0])).toEqual([PRIMARY, FALLBACK]);
    expect(jest.getTimerCount()).toBe(0);
  });

  it('cả 2 key đang trong thời gian chờ: báo lỗi ngay, không gọi Google', async () => {
    const pool = makePool();
    await pool.run(MODEL, byKey({ [PRIMARY]: fail(dayQuota('3600s')), [FALLBACK]: fail(http(402)) })).catch(() => undefined);

    const call = byKey({ [PRIMARY]: ok('A'), [FALLBACK]: ok('B') });
    const error = await pool.run(MODEL, call).catch((e) => e);

    expect(error).toBeInstanceOf(GeminiKeysExhaustedException);
    expect(error).toBeInstanceOf(ServiceUnavailableException);
    expect(call).not.toHaveBeenCalled();
  });

  it('key dự phòng hết số dư thì thử lại sau 5 phút (để nạp tiền xong là dùng được ngay)', async () => {
    const pool = makePool();
    await pool.run(MODEL, byKey({ [PRIMARY]: fail(dayQuota('86400s')), [FALLBACK]: fail(http(402)) })).catch(() => undefined);

    jest.setSystemTime(Date.now() + 5 * 60_000 + 1);
    const call = byKey({ [PRIMARY]: ok('A'), [FALLBACK]: ok('B') });
    await expect(pool.run(MODEL, call)).resolves.toBe('B');
    expect(call.mock.calls.map((c) => c[0])).toEqual([FALLBACK]);
  });

  describe('chỉ cấu hình 1 key', () => {
    it('chỉ có key chính, hết hạn mức ngày: ném lỗi gốc ngay, không thử lại', async () => {
      const pool = makePool({ GEMINI_API_KEY: PRIMARY });
      const err = dayQuota('3600s');
      const call = jest.fn(() => Promise.reject(err));

      await expect(pool.run(MODEL, call)).rejects.toBe(err);
      expect(call).toHaveBeenCalledTimes(1);
      expect(jest.getTimerCount()).toBe(0);
    });

    it('chỉ có key chính, 429 theo phút: vẫn chờ rồi thử lại như trước', async () => {
      const pool = makePool({ GEMINI_API_KEY: PRIMARY });
      const call = jest.fn().mockRejectedValueOnce(http(429)).mockResolvedValue('A');

      const settled = pool.run(MODEL, call, { random: () => 0 });
      await jest.advanceTimersByTimeAsync(10_000);

      await expect(settled).resolves.toBe('A');
      expect(call).toHaveBeenCalledTimes(2);
    });

    it('chỉ có key dự phòng (key chính để trống): dùng key dự phòng', async () => {
      const pool = makePool({ GEMINI_API_KEY: '  ', GEMINI_API_KEY_FALLBACK: FALLBACK });
      const call = byKey({ [FALLBACK]: ok('B') });

      await expect(pool.run(MODEL, call)).resolves.toBe('B');
    });

    it('key dự phòng trùng key chính: coi như 1 key', async () => {
      const pool = makePool({ GEMINI_API_KEY: PRIMARY, GEMINI_API_KEY_FALLBACK: ` ${PRIMARY} ` });
      const err = dayQuota('3600s');
      const call = jest.fn(() => Promise.reject(err));

      await expect(pool.run(MODEL, call)).rejects.toBe(err);
      expect(call).toHaveBeenCalledTimes(1);
    });

    it('không có key nào: báo chưa cấu hình', async () => {
      const pool = makePool({});
      await expect(pool.run(MODEL, jest.fn())).rejects.toThrow('Chưa cấu hình GEMINI_API_KEY');
    });
  });

  it('ghi log khi chuyển key và khi dùng key dự phòng, KHÔNG lộ API key', async () => {
    const warn = jest.spyOn(Logger.prototype, 'warn').mockImplementation(() => undefined);
    const log = jest.spyOn(Logger.prototype, 'log').mockImplementation(() => undefined);
    const pool = makePool();

    await pool.run(MODEL, byKey({ [PRIMARY]: fail(dayQuota('3600s')), [FALLBACK]: ok() }));
    await pool.run(MODEL, byKey({ [PRIMARY]: ok(), [FALLBACK]: ok() }));

    const messages = [...warn.mock.calls, ...log.mock.calls].map((c) => String(c[0]));
    expect(messages.some((m) => /key chính/.test(m) && /hạn mức ngày/.test(m) && /dự phòng/.test(m))).toBe(true);
    expect(messages.filter((m) => /dùng key dự phòng/.test(m))).toHaveLength(2);
    const all = messages.join('\n');
    expect(all).not.toContain(PRIMARY);
    expect(all).not.toContain(FALLBACK);
  });
});
