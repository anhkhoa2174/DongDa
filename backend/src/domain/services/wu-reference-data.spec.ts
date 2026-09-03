import {
  isVietnamCountry,
  normalizeCountryName,
  normalizeUpperText,
  normalizeUsStateName,
} from './wu-reference-data';

describe('WU reference data normalization', () => {
  it.each(['Việt Nam', 'Vietnam', 'VIET NAM', 'VN', 'VNM'])(
    'recognizes %s as Vietnam',
    (value) => {
      expect(normalizeCountryName(value)).toBe('VIETNAM');
      expect(isVietnamCountry(value)).toBe(true);
    },
  );

  it('formats country names and issuing places consistently', () => {
    expect(normalizeCountryName(' united   kingdom ')).toBe('UNITED KINGDOM');
    expect(normalizeUpperText(' cục cảnh sát  qlhc ')).toBe('CỤC CẢNH SÁT QLHC');
  });

  it('expands a US state abbreviation to its full name', () => {
    expect(normalizeUsStateName('CA')).toBe('California');
    expect(normalizeUsStateName('ny')).toBe('New York');
    expect(normalizeUsStateName('Texas')).toBe('Texas');
  });
});
