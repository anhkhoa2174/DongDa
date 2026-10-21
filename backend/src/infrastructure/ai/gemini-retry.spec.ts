import { isTransientGeminiError, withGeminiRetry } from './gemini-retry';

const httpError = (status: number) => ({ response: { status } });

function makeClock() {
  let t = 0;
  const sleeps: number[] = [];
  return {
    sleeps,
    now: () => t,
    sleep: async (ms: number) => { sleeps.push(ms); t += ms; },
    advance: (ms: number) => { t += ms; },
  };
}

describe('isTransientGeminiError', () => {
  it.each([429, 408, 500, 502, 503, 504])('retries HTTP %s', (status) => {
    expect(isTransientGeminiError(httpError(status))).toBe(true);
  });

  it.each([400, 401, 402, 403, 404])('does not retry HTTP %s (retrying cannot fix it)', (status) => {
    expect(isTransientGeminiError(httpError(status))).toBe(false);
  });

  it.each(['ECONNRESET', 'EAI_AGAIN', 'ECONNREFUSED', 'ENOTFOUND', 'EPIPE', 'ERR_NETWORK'])(
    'retries connection error %s', (code) => {
      expect(isTransientGeminiError({ code })).toBe(true);
    },
  );

  it.each(['ECONNABORTED', 'ETIMEDOUT'])('does not retry our own timeout %s (already waited the full timeout)', (code) => {
    expect(isTransientGeminiError({ code })).toBe(false);
  });

  it('does not retry unknown or empty errors', () => {
    expect(isTransientGeminiError(new Error('boom'))).toBe(false);
    expect(isTransientGeminiError(undefined)).toBe(false);
    expect(isTransientGeminiError(null)).toBe(false);
  });
});

describe('withGeminiRetry', () => {
  it('returns the result without sleeping when the first call succeeds', async () => {
    const clock = makeClock();
    const fn = jest.fn().mockResolvedValue('ok');

    await expect(withGeminiRetry(fn, { ...clock })).resolves.toBe('ok');

    expect(fn).toHaveBeenCalledTimes(1);
    expect(clock.sleeps).toEqual([]);
  });

  it('retries a 503 and returns the later success, waiting 2s then 4s (exponential)', async () => {
    const clock = makeClock();
    const fn = jest.fn()
      .mockRejectedValueOnce(httpError(503))
      .mockRejectedValueOnce(httpError(503))
      .mockResolvedValue('ok');

    await expect(withGeminiRetry(fn, { ...clock, random: () => 0 })).resolves.toBe('ok');

    expect(fn).toHaveBeenCalledTimes(3);
    expect(clock.sleeps).toEqual([2000, 4000]);
  });

  it('adds random jitter on top of the exponential delay', async () => {
    const clock = makeClock();
    const fn = jest.fn().mockRejectedValueOnce(httpError(429)).mockResolvedValue('ok');

    await withGeminiRetry(fn, { ...clock, random: () => 0.5 });

    expect(clock.sleeps).toEqual([2000 + 1000]); // base 2000 + jitter 0.5 * base
  });

  it('gives up after 3 attempts and throws the last error unchanged', async () => {
    const clock = makeClock();
    const last = httpError(503);
    const fn = jest.fn()
      .mockRejectedValueOnce(httpError(503))
      .mockRejectedValueOnce(httpError(503))
      .mockRejectedValueOnce(last);

    await expect(withGeminiRetry(fn, { ...clock, random: () => 0 })).rejects.toBe(last);

    expect(fn).toHaveBeenCalledTimes(3);
    expect(clock.sleeps).toEqual([2000, 4000]);
  });

  it.each([400, 401, 403])('fails immediately on HTTP %s without retrying', async (status) => {
    const clock = makeClock();
    const err = httpError(status);
    const fn = jest.fn().mockRejectedValue(err);

    await expect(withGeminiRetry(fn, { ...clock })).rejects.toBe(err);

    expect(fn).toHaveBeenCalledTimes(1);
    expect(clock.sleeps).toEqual([]);
  });

  it('does not start another attempt once the total time budget would be exceeded', async () => {
    const clock = makeClock();
    const err = httpError(503);
    const fn = jest.fn().mockImplementation(async () => { clock.advance(50_000); throw err; });

    // attempt 1 ends at 50s; waiting 2s then attempt 2 would end at 102s > 60s budget -> stop after 1st wait check
    await expect(withGeminiRetry(fn, { ...clock, random: () => 0, maxTotalMs: 60_000 })).rejects.toBe(err);

    expect(fn.mock.calls.length).toBeLessThan(3);
  });

  it('reports every retry through onRetry without exposing the error object', async () => {
    const clock = makeClock();
    const onRetry = jest.fn();
    const fn = jest.fn().mockRejectedValueOnce(httpError(503)).mockResolvedValue('ok');

    await withGeminiRetry(fn, { ...clock, random: () => 0, onRetry });

    expect(onRetry).toHaveBeenCalledTimes(1);
    expect(onRetry).toHaveBeenCalledWith({ attempt: 1, maxAttempts: 3, delayMs: 2000, status: 503 });
  });
});
