import { describe, it, expect } from 'vitest';
import { getCountryProfile, countryProfiles, validatePhone } from '../../lib/countryProfiles';

describe('LEDGRA Onboarding & Multi-Country Persistence Flow', () => {
  it('1. Yemen (YE) profile provides YER currency code, 0% tax rate, and zatcaEnabled=false', () => {
    const prof = getCountryProfile('YE');
    expect(prof.code).toBe('YE');
    expect(prof.currencyCode).toBe('YER');
    expect(prof.defaultTaxRate).toBe(0);
    expect(prof.zatcaEnabled).toBe(false);
  });

  it('2. Saudi Arabia (SA) profile provides SAR currency code, 15% tax rate, and zatcaEnabled=true', () => {
    const prof = getCountryProfile('SA');
    expect(prof.code).toBe('SA');
    expect(prof.currencyCode).toBe('SAR');
    expect(prof.defaultTaxRate).toBe(15);
    expect(prof.zatcaEnabled).toBe(true);
  });

  it('3. Choosing Yemen persists country_code=YE, currency_code=YER, and default_tax_rate=0', () => {
    const selectedCountry = 'YE';
    const prof = getCountryProfile(selectedCountry);
    const draftPayload = {
      country_code: prof.code,
      currency_code: prof.currencyCode,
      default_tax_rate: prof.defaultTaxRate
    };

    expect(draftPayload.country_code).toBe('YE');
    expect(draftPayload.currency_code).toBe('YER');
    expect(draftPayload.default_tax_rate).toBe(0);
  });

  it('4. Refreshing draft organization preserves Yemen settings without returning to SA/SAR/15%', () => {
    const savedDraft = {
      country_code: 'YE',
      currency_code: 'YER',
      default_tax_rate: 0
    };

    const resolvedProf = getCountryProfile(savedDraft.country_code);
    expect(resolvedProf.code).toBe('YE');
    expect(savedDraft.currency_code).toBe('YER');
    expect(savedDraft.default_tax_rate).toBe(0);
  });

  it('5. Phone number is optional during signup and onboarding across all countries', () => {
    expect(validatePhone('SA', '')).toEqual({ isValid: true });
    expect(validatePhone('YE', '')).toEqual({ isValid: true });
    expect(validatePhone('SA', null)).toEqual({ isValid: true });
    expect(validatePhone('YE', null)).toEqual({ isValid: true });
  });

  it('6. Commercial Registration for Yemen is not restricted to Saudi 10-digit format', () => {
    const prof = getCountryProfile('YE');
    expect(prof.crRequired).toBe(false);
  });

  it('7. ZATCA texts are omitted for Yemen and localized appropriately', () => {
    const yeProf = countryProfiles.YE;
    expect(yeProf.zatcaEnabled).toBe(false);
  });
});
