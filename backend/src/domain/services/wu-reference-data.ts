const US_STATE_NAMES: Record<string, string> = {
  AL: 'Alabama', AK: 'Alaska', AZ: 'Arizona', AR: 'Arkansas', CA: 'California',
  CO: 'Colorado', CT: 'Connecticut', DE: 'Delaware', FL: 'Florida', GA: 'Georgia',
  HI: 'Hawaii', ID: 'Idaho', IL: 'Illinois', IN: 'Indiana', IA: 'Iowa',
  KS: 'Kansas', KY: 'Kentucky', LA: 'Louisiana', ME: 'Maine', MD: 'Maryland',
  MA: 'Massachusetts', MI: 'Michigan', MN: 'Minnesota', MS: 'Mississippi', MO: 'Missouri',
  MT: 'Montana', NE: 'Nebraska', NV: 'Nevada', NH: 'New Hampshire', NJ: 'New Jersey',
  NM: 'New Mexico', NY: 'New York', NC: 'North Carolina', ND: 'North Dakota', OH: 'Ohio',
  OK: 'Oklahoma', OR: 'Oregon', PA: 'Pennsylvania', RI: 'Rhode Island', SC: 'South Carolina',
  SD: 'South Dakota', TN: 'Tennessee', TX: 'Texas', UT: 'Utah', VT: 'Vermont',
  VA: 'Virginia', WA: 'Washington', WV: 'West Virginia', WI: 'Wisconsin', WY: 'Wyoming',
  DC: 'District of Columbia',
};

const US_STATE_CANONICAL = new Map(
  Object.values(US_STATE_NAMES).map((name) => [name.toLocaleLowerCase('en-US'), name]),
);

export function normalizeUsStateName(value?: string): string | undefined {
  const normalized = value?.trim();
  if (!normalized) return undefined;
  return US_STATE_NAMES[normalized.toUpperCase()]
    ?? US_STATE_CANONICAL.get(normalized.toLocaleLowerCase('en-US'))
    ?? normalized;
}

export function normalizeCountryName(value: string): string {
  const trimmed = value.trim().replace(/\s+/g, ' ');
  const comparable = trimmed
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/Đ/g, 'D')
    .replace(/đ/g, 'd')
    .replace(/[^A-Za-z0-9]/g, '')
    .toUpperCase();
  return ['VN', 'VNM', 'VIETNAM'].includes(comparable)
    ? 'VIETNAM'
    : trimmed.toLocaleUpperCase('en-US');
}

export function normalizeUpperText(value?: string): string {
  return value?.trim().replace(/\s+/g, ' ').toLocaleUpperCase('vi-VN') ?? '';
}

export function isVietnamCountry(value: string): boolean {
  return normalizeCountryName(value) === 'VIETNAM';
}
