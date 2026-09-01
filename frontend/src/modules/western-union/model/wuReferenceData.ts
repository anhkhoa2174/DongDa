const ISO_COUNTRY_CODES = `
AD AE AF AG AI AL AM AO AQ AR AS AT AU AW AX AZ BA BB BD BE BF BG BH BI BJ BL BM BN BO BQ BR BS BT BV BW BY BZ
CA CC CD CF CG CH CI CK CL CM CN CO CR CU CV CW CX CY CZ DE DJ DK DM DO DZ EC EE EG EH ER ES ET FI FJ FK FM FO FR
GA GB GD GE GF GG GH GI GL GM GN GP GQ GR GS GT GU GW GY HK HM HN HR HT HU ID IE IL IM IN IO IQ IR IS IT JE JM JO
JP KE KG KH KI KM KN KP KR KW KY KZ LA LB LC LI LK LR LS LT LU LV LY MA MC MD ME MF MG MH MK ML MM MN MO MP MQ MR MS
MT MU MV MW MX MY MZ NA NC NE NF NG NI NL NO NP NR NU NZ OM PA PE PF PG PH PK PL PM PN PR PS PT PW PY QA RE RO RS RU
RW SA SB SC SD SE SG SH SI SJ SK SL SM SN SO SR SS ST SV SX SY SZ TC TD TF TG TH TJ TK TL TM TN TO TR TT TV TW TZ UA
UG UM US UY UZ VA VC VE VG VI VN VU WF WS YE YT ZA ZM ZW
`.trim().split(/\s+/);

const vietnameseNames = new Intl.DisplayNames(['vi'], { type: 'region' });
const englishNames = new Intl.DisplayNames(['en'], { type: 'region' });

export const countryOptions = ISO_COUNTRY_CODES
  .map((code) => {
    const englishName = englishNames.of(code) ?? code;
    const vietnameseName = vietnameseNames.of(code) ?? englishName;
    const value = code === 'VN' ? 'VIETNAM' : englishName.toUpperCase();
    return { value, label: `${vietnameseName} (${value})` };
  })
  .sort((first, second) => first.label.localeCompare(second.label, 'vi'));

const US_STATES: Array<[string, string]> = [
  ['AL', 'Alabama'], ['AK', 'Alaska'], ['AZ', 'Arizona'], ['AR', 'Arkansas'], ['CA', 'California'],
  ['CO', 'Colorado'], ['CT', 'Connecticut'], ['DE', 'Delaware'], ['FL', 'Florida'], ['GA', 'Georgia'],
  ['HI', 'Hawaii'], ['ID', 'Idaho'], ['IL', 'Illinois'], ['IN', 'Indiana'], ['IA', 'Iowa'],
  ['KS', 'Kansas'], ['KY', 'Kentucky'], ['LA', 'Louisiana'], ['ME', 'Maine'], ['MD', 'Maryland'],
  ['MA', 'Massachusetts'], ['MI', 'Michigan'], ['MN', 'Minnesota'], ['MS', 'Mississippi'], ['MO', 'Missouri'],
  ['MT', 'Montana'], ['NE', 'Nebraska'], ['NV', 'Nevada'], ['NH', 'New Hampshire'], ['NJ', 'New Jersey'],
  ['NM', 'New Mexico'], ['NY', 'New York'], ['NC', 'North Carolina'], ['ND', 'North Dakota'], ['OH', 'Ohio'],
  ['OK', 'Oklahoma'], ['OR', 'Oregon'], ['PA', 'Pennsylvania'], ['RI', 'Rhode Island'], ['SC', 'South Carolina'],
  ['SD', 'South Dakota'], ['TN', 'Tennessee'], ['TX', 'Texas'], ['UT', 'Utah'], ['VT', 'Vermont'],
  ['VA', 'Virginia'], ['WA', 'Washington'], ['WV', 'West Virginia'], ['WI', 'Wisconsin'], ['WY', 'Wyoming'],
  ['DC', 'District of Columbia'],
];

const usStateByCode = new Map(US_STATES.map(([code, name]) => [code, name]));
const usStateByName = new Map(US_STATES.map(([, name]) => [name.toLocaleLowerCase('en-US'), name]));

export const usStateOptions = US_STATES.map(([, name]) => ({ value: name }));

export function normalizeUsStateName(value?: string): string | undefined {
  const normalized = value?.trim();
  if (!normalized) return undefined;
  return usStateByCode.get(normalized.toUpperCase())
    ?? usStateByName.get(normalized.toLocaleLowerCase('en-US'))
    ?? normalized;
}

export function normalizeCountryName(value?: string): string {
  const trimmed = value?.trim().replace(/\s+/g, ' ') ?? '';
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

export function filterReferenceOption(inputValue: string, option?: { value?: string; label?: string }) {
  const keyword = inputValue.toLocaleLowerCase('vi-VN');
  return `${option?.label ?? ''} ${option?.value ?? ''}`.toLocaleLowerCase('vi-VN').includes(keyword);
}
