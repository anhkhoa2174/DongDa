// Nhiều API key Gemini: dùng key chính (GEMINI_API_KEY, thường là gói free) trước; khi key chính hết
// hạn mức / hết số dư / bị từ chối thì chuyển NGAY sang key dự phòng (GEMINI_API_KEY_FALLBACK, trả phí)
// trong cùng request, rồi nhớ trạng thái để các request sau đi thẳng key dự phòng. Hết thời gian chờ
// Google báo (retryDelay) thì tự quay về key chính để không tốn tiền.
//
// Google KHÔNG có API cho biết còn bao nhiêu hạn mức/credit qua API key, nên không chuyển trước được.
// Chỉ phát hiện khi Google trả lỗi 429/402/401/403 — các lỗi này trả về gần như ngay (~1s).
// Lỗi quá tải 503 / mạng KHÔNG đổi key (đổi key không giúp, lại tốn tiền): thử lại trên cùng key.
// Layer: Infrastructure.

import { Injectable, Logger, ServiceUnavailableException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { GeminiRetryOptions, isTransientGeminiError, withGeminiRetry } from './gemini-retry';

export type GeminiKeyFailureKind = 'quota-day' | 'quota-minute' | 'credit' | 'auth' | 'other';

export interface GeminiKeyFailure {
  kind: GeminiKeyFailureKind;
  retryAfterMs?: number;
}

const SECOND = 1000;
const MINUTE = 60 * SECOND;
const HOUR = 60 * MINUTE;

// Thời gian "nghỉ" một key trước khi thử lại nó.
const COOLDOWN = {
  dayDefault: HOUR,
  dayMax: 24 * HOUR,
  minuteDefault: MINUTE,
  minuteMax: 5 * MINUTE,
  credit: 5 * MINUTE, // ngắn: nạp tiền xong là dùng lại được ngay
  auth: 10 * MINUTE,
};

const KEY_SOURCES = [
  { label: 'chính', env: 'GEMINI_API_KEY' },
  { label: 'dự phòng', env: 'GEMINI_API_KEY_FALLBACK' },
] as const;

const REASON: Record<Exclude<GeminiKeyFailureKind, 'other'>, string> = {
  'quota-day': 'hết hạn mức ngày',
  'quota-minute': 'vượt hạn mức theo phút',
  credit: 'hết số dư / chạm trần chi tiêu',
  auth: 'bị từ chối (key sai hoặc project bị chặn)',
};

export class GeminiKeysExhaustedException extends ServiceUnavailableException {
  constructor() {
    super(
      'Gemini đã hết hạn mức hoặc số dư ở tất cả API key. Hệ thống sẽ tự thử lại sau; '
      + 'nếu cần gấp hãy kiểm tra key trong Google AI Studio.',
    );
  }
}

/** "59s", "3.5s", "16h31m9.5s", "2m" -> ms. Không đọc được -> undefined. */
export function parseGeminiDurationMs(text: unknown): number | undefined {
  if (typeof text !== 'string') return undefined;
  const m = /^(?:(\d+)h)?(?:(\d+)m(?!s))?(?:(\d+(?:\.\d+)?)s)?$/.exec(text.trim().replace(/\.+$/, ''));
  if (!m || (!m[1] && !m[2] && !m[3])) return undefined;
  return Math.round(((Number(m[1] ?? 0) * 60 + Number(m[2] ?? 0)) * 60 + Number(m[3] ?? 0)) * 1000);
}

export function classifyGeminiKeyFailure(error: any): GeminiKeyFailure {
  const status = Number(error?.response?.status);
  if (status === 402) return { kind: 'credit' };
  if (status === 401 || status === 403) return { kind: 'auth' };

  const body = error?.response?.data?.error ?? {};
  const details: any[] = Array.isArray(body.details) ? body.details : [];
  // Key sai: Google trả 400 INVALID_ARGUMENT kèm reason API_KEY_INVALID, không phải 401.
  if (status === 400 && details.some((d) => d?.reason === 'API_KEY_INVALID')) return { kind: 'auth' };
  if (status !== 429) return { kind: 'other' };

  const message = String(body.message ?? '');
  if (/spending cap|spend limit|spend-based|prepaid|prepay|insufficient|out of credit/i.test(message)) {
    return { kind: 'credit' };
  }
  const quotaIds = details.flatMap((d) => (Array.isArray(d?.violations) ? d.violations : [])).map((v) => String(v?.quotaId ?? ''));
  const retryAfterMs = parseGeminiDurationMs(details.find((d) => d?.retryDelay)?.retryDelay)
    ?? parseGeminiDurationMs(/retry in\s+([\d.hms]+)/i.exec(message)?.[1]);
  const isDaily = quotaIds.some((q) => /PerDay/i.test(q)) || /per day/i.test(message);
  return { kind: isDaily ? 'quota-day' : 'quota-minute', retryAfterMs };
}

function cooldownMs(failure: GeminiKeyFailure): number {
  const clamp = (v: number | undefined, def: number, max: number) => Math.min(Math.max(v ?? def, SECOND), max);
  switch (failure.kind) {
    case 'quota-day': return clamp(failure.retryAfterMs, COOLDOWN.dayDefault, COOLDOWN.dayMax);
    case 'quota-minute': return clamp(failure.retryAfterMs, COOLDOWN.minuteDefault, COOLDOWN.minuteMax);
    case 'credit': return COOLDOWN.credit;
    default: return COOLDOWN.auth;
  }
}

function formatVnTime(ms: number): string {
  return new Date(ms).toLocaleTimeString('vi-VN', {
    timeZone: 'Asia/Ho_Chi_Minh', hour: '2-digit', minute: '2-digit', hour12: false,
  });
}

interface GeminiKey {
  label: string;
  value: string;
}

@Injectable()
export class GeminiKeyPool {
  private readonly logger = new Logger(GeminiKeyPool.name);
  /** `${label}|${model}` -> thời điểm (ms) được thử lại key. Không lưu giá trị key. */
  private readonly downUntil = new Map<string, number>();

  constructor(private readonly config: ConfigService) {}

  async run<T>(model: string, call: (apiKey: string) => Promise<T>, retry: GeminiRetryOptions = {}): Promise<T> {
    const keys = this.configuredKeys();
    if (keys.length === 0) throw new ServiceUnavailableException('Chưa cấu hình GEMINI_API_KEY');

    const now = Date.now();
    const usable = keys.filter((key) => (this.downUntil.get(this.slot(key, model)) ?? 0) <= now);
    if (usable.length === 0) throw new GeminiKeysExhaustedException();

    for (let i = 0; i < usable.length; i++) {
      const key = usable[i];
      const isLast = i === usable.length - 1;
      if (key.label !== KEY_SOURCES[0].label) this.logger.log(`Gemini: dùng key ${key.label} (model=${model})`);
      try {
        const result = await withGeminiRetry(() => call(key.value), {
          ...retry,
          isTransient: (error) => this.shouldRetrySameKey(error, isLast),
        });
        this.downUntil.delete(this.slot(key, model));
        return result;
      } catch (error) {
        const failure = classifyGeminiKeyFailure(error);
        if (failure.kind === 'other') throw error;
        const until = Date.now() + cooldownMs(failure);
        this.downUntil.set(this.slot(key, model), until);
        const reason = `Gemini: key ${key.label} ${REASON[failure.kind]} (model=${model}), thử lại key này sau ${formatVnTime(until)}`;
        if (isLast) {
          this.logger.warn(`${reason}; không còn key nào khác`);
          if (i > 0) throw new GeminiKeysExhaustedException();
          throw error;
        }
        this.logger.warn(`${reason}; chuyển ngay sang key ${usable[i + 1].label}`);
      }
    }
    // Không tới được: vòng lặp luôn return hoặc throw ở key cuối.
    throw new GeminiKeysExhaustedException();
  }

  private configuredKeys(): GeminiKey[] {
    const keys: GeminiKey[] = [];
    for (const source of KEY_SOURCES) {
      const value = this.config.get<string>(source.env)?.trim();
      if (value && !keys.some((k) => k.value === value)) keys.push({ label: source.label, value });
    }
    return keys;
  }

  private slot(key: GeminiKey, model: string): string {
    return `${key.label}|${model}`;
  }

  /** Thử lại trên CÙNG key: lỗi quá tải/mạng; 429 theo phút chỉ khi không còn key nào để chuyển. */
  private shouldRetrySameKey(error: any, isLast: boolean): boolean {
    if (!isTransientGeminiError(error)) return false;
    const kind = classifyGeminiKeyFailure(error).kind;
    if (kind === 'other') return true;
    return isLast && kind === 'quota-minute';
  }
}
