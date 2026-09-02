import { ConflictException } from '@nestjs/common';
import { createHash } from 'crypto';

interface IdempotencyRow {
  request_hash: string;
  response: unknown;
}

export async function claimFinancialRequest<T>(
  tx: any,
  scope: string,
  key: string,
  request: unknown,
): Promise<T | null> {
  const requestHash = hashRequest(request);
  const inserted = await tx.$executeRaw`
    INSERT INTO financial_idempotency_keys (scope, idempotency_key, request_hash)
    VALUES (${scope}, ${key}, ${requestHash})
    ON CONFLICT (scope, idempotency_key) DO NOTHING
  `;
  if (Number(inserted) === 1) return null;

  const rows = await tx.$queryRaw<IdempotencyRow[]>`
    SELECT request_hash, response
    FROM financial_idempotency_keys
    WHERE scope = ${scope} AND idempotency_key = ${key}
  `;
  const existing = rows[0];
  if (!existing || existing.request_hash !== requestHash) {
    throw new ConflictException('Idempotency-Key đã được dùng cho dữ liệu nghiệp vụ khác');
  }
  if (existing.response === null) {
    throw new ConflictException('Yêu cầu có cùng Idempotency-Key đang được xử lý');
  }
  return existing.response as T;
}

export async function completeFinancialRequest(
  tx: any,
  scope: string,
  key: string,
  response: unknown,
): Promise<void> {
  const json = JSON.stringify(response);
  const updated = await tx.$executeRaw`
    UPDATE financial_idempotency_keys
    SET response = ${json}::jsonb
    WHERE scope = ${scope} AND idempotency_key = ${key}
  `;
  if (Number(updated) !== 1) {
    throw new ConflictException('Không thể hoàn tất Idempotency-Key cho nghiệp vụ tài chính');
  }
}

function hashRequest(value: unknown): string {
  return createHash('sha256').update(stableStringify(value)).digest('hex');
}

function stableStringify(value: unknown): string {
  return JSON.stringify(normalize(value));
}

function normalize(value: unknown): unknown {
  if (value instanceof Date) return value.toISOString();
  if (Array.isArray(value)) return value.map(normalize);
  if (value && typeof value === 'object') {
    return Object.keys(value as Record<string, unknown>)
      .filter((key) => key !== 'idempotencyKey' && (value as Record<string, unknown>)[key] !== undefined)
      .sort()
      .reduce<Record<string, unknown>>((result, key) => {
        result[key] = normalize((value as Record<string, unknown>)[key]);
        return result;
      }, {});
  }
  return value;
}
