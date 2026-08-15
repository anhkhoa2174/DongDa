const VIETNAM_OFFSET_MS = 7 * 60 * 60 * 1000;

export function toVietnamBusinessDate(value: Date = new Date()): Date {
  const vietnamTime = new Date(value.getTime() + VIETNAM_OFFSET_MS);
  return new Date(Date.UTC(
    vietnamTime.getUTCFullYear(),
    vietnamTime.getUTCMonth(),
    vietnamTime.getUTCDate(),
  ));
}
