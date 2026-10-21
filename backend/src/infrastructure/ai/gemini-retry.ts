// Thử lại khi Gemini lỗi tạm thời (Google quá tải 503, vượt tốc độ 429, đứt mạng).
// Theo khuyến nghị của Google (docs troubleshooting): backoff lũy thừa + jitter, chỉ thử lại lỗi tạm
// thời (429/408/5xx), có giới hạn số lần. Layer: Infrastructure.

const TRANSIENT_STATUSES = new Set([408, 429]);
// Timeout do chính mình đặt (ECONNABORTED/ETIMEDOUT) KHÔNG thử lại: đã chờ trọn thời gian chờ rồi.
const TRANSIENT_CODES = new Set(['ECONNRESET', 'EAI_AGAIN', 'ECONNREFUSED', 'ENOTFOUND', 'EPIPE', 'ERR_NETWORK']);

export interface GeminiRetryInfo {
  attempt: number;
  maxAttempts: number;
  delayMs: number;
  status: number | null;
}

export interface GeminiRetryOptions {
  maxAttempts?: number;
  baseDelayMs?: number;
  /** Không bắt đầu lần thử mới nếu tổng thời gian (kể cả chờ) sẽ vượt mức này. */
  maxTotalMs?: number;
  sleep?: (ms: number) => Promise<void>;
  now?: () => number;
  random?: () => number;
  /** Chỉ nhận số liệu, không nhận error: error của axios chứa API key và nội dung file. */
  onRetry?: (info: GeminiRetryInfo) => void;
}

export function isTransientGeminiError(error: any): boolean {
  const status = Number(error?.response?.status);
  if (Number.isInteger(status)) return TRANSIENT_STATUSES.has(status) || (status >= 500 && status <= 599);
  return TRANSIENT_CODES.has(error?.code);
}

export async function withGeminiRetry<T>(fn: () => Promise<T>, options: GeminiRetryOptions = {}): Promise<T> {
  const {
    maxAttempts = 3,
    baseDelayMs = 2000,
    maxTotalMs = Infinity,
    sleep = (ms) => new Promise<void>((resolve) => setTimeout(resolve, ms)),
    now = Date.now,
    random = Math.random,
    onRetry,
  } = options;
  const startedAt = now();

  for (let attempt = 1; ; attempt++) {
    try {
      return await fn();
    } catch (error: any) {
      if (attempt >= maxAttempts || !isTransientGeminiError(error)) throw error;
      const delayMs = baseDelayMs * 2 ** (attempt - 1) + random() * baseDelayMs;
      if (now() - startedAt + delayMs > maxTotalMs) throw error;
      const status = Number(error?.response?.status);
      onRetry?.({ attempt, maxAttempts, delayMs, status: Number.isInteger(status) ? status : null });
      await sleep(delayMs);
    }
  }
}
