import { BadRequestException } from '@nestjs/common';

const IDEMPOTENCY_KEY_PATTERN = /^[A-Za-z0-9._:-]+$/;

export function requireIdempotencyKey(value?: string): string {
  const key = value?.trim();
  if (!key) {
    throw new BadRequestException('Thiếu header Idempotency-Key');
  }
  if (key.length < 8 || key.length > 200 || !IDEMPOTENCY_KEY_PATTERN.test(key)) {
    throw new BadRequestException(
      'Idempotency-Key phải dài 8-200 ký tự và chỉ gồm chữ, số, dấu chấm, gạch dưới, gạch ngang hoặc dấu hai chấm',
    );
  }
  return key;
}
