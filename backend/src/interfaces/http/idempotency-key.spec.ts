import { BadRequestException } from '@nestjs/common';
import { requireIdempotencyKey } from './idempotency-key';

describe('requireIdempotencyKey', () => {
  it('normalizes a valid key', () => {
    expect(requireIdempotencyKey('  request-key-1  ')).toBe('request-key-1');
  });

  it.each([undefined, '', 'short', 'key with spaces'])('rejects an invalid key: %s', (key) => {
    expect(() => requireIdempotencyKey(key)).toThrow(BadRequestException);
  });
});
