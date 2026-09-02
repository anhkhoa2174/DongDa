export function createIdempotencyKey(): string {
  if (typeof globalThis.crypto?.randomUUID === 'function') {
    return globalThis.crypto.randomUUID();
  }
  return `${Date.now()}-${Math.random().toString(36).slice(2)}-${Math.random().toString(36).slice(2)}`;
}

const memoryKeys = new Map<string, string>();
const STORAGE_PREFIX = 'dongda:idempotency:';

export async function runIdempotent<T>(
  operation: string,
  payload: unknown,
  send: (headers: Record<string, string>) => Promise<T>,
): Promise<T> {
  const cacheKey = `${operation}:${hash(stableStringify(payload))}`;
  const storageKey = `${STORAGE_PREFIX}${cacheKey}`;
  const storedKey = readSessionKey(storageKey);
  const idempotencyKey = memoryKeys.get(cacheKey) ?? storedKey ?? createIdempotencyKey();
  memoryKeys.set(cacheKey, idempotencyKey);
  writeSessionKey(storageKey, idempotencyKey);

  try {
    const result = await send({ 'Idempotency-Key': idempotencyKey });
    memoryKeys.delete(cacheKey);
    removeSessionKey(storageKey);
    return result;
  } catch (error) {
    // Giữ khóa sau timeout/lỗi mạng để lần gửi lại không tạo thêm bút toán.
    throw error;
  }
}

function stableStringify(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(stableStringify).join(',')}]`;
  if (value && typeof value === 'object') {
    return `{${Object.keys(value as Record<string, unknown>).sort().map((key) =>
      `${JSON.stringify(key)}:${stableStringify((value as Record<string, unknown>)[key])}`,
    ).join(',')}}`;
  }
  return JSON.stringify(value);
}

function hash(value: string): string {
  let result = 2166136261;
  for (let index = 0; index < value.length; index += 1) {
    result ^= value.charCodeAt(index);
    result = Math.imul(result, 16777619);
  }
  return (result >>> 0).toString(36);
}

function readSessionKey(key: string): string | null {
  try {
    return globalThis.sessionStorage?.getItem(key) ?? null;
  } catch {
    return null;
  }
}

function writeSessionKey(key: string, value: string): void {
  try {
    globalThis.sessionStorage?.setItem(key, value);
  } catch {
    // Bộ nhớ tạm vẫn bảo vệ được retry trong phiên đang chạy.
  }
}

function removeSessionKey(key: string): void {
  try {
    globalThis.sessionStorage?.removeItem(key);
  } catch {
    // Không cần làm gì nếu trình duyệt chặn sessionStorage.
  }
}
