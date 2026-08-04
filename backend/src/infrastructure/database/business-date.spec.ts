import { toVietnamBusinessDate } from './business-date';

describe('toVietnamBusinessDate', () => {
  it('moves an early UTC evening into the next Vietnam business day', () => {
    const result = toVietnamBusinessDate(new Date('2026-08-03T18:00:00.000Z'));
    expect(result.toISOString()).toBe('2026-08-04T00:00:00.000Z');
  });

  it('keeps an ISO date-only value in the same business day', () => {
    const result = toVietnamBusinessDate(new Date('2026-08-03T00:00:00.000Z'));
    expect(result.toISOString()).toBe('2026-08-03T00:00:00.000Z');
  });
});
