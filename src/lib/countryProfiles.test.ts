import { describe, it, expect } from 'vitest';
import {
  getCountryProfile,
  getDefaultCountryProfile,
  validateCommercialRegistration,
  validateTaxNumber,
  validatePhone,
  getOrgDefaultTaxRate,
  countryProfiles
} from './countryProfiles';

describe('Country Profiles and Business Rules', () => {
  it('should resolve correct currency and default tax rate for Saudi Arabia', () => {
    const profile = getCountryProfile('SA');
    expect(profile.code).toBe('SA');
    expect(profile.currencyCode).toBe('SAR');
    expect(profile.defaultTaxRate).toBe(15);
    expect(profile.zatcaEnabled).toBe(true);
  });

  it('should resolve correct currency and default tax rate for Yemen', () => {
    const profile = getCountryProfile('YE');
    expect(profile.code).toBe('YE');
    expect(profile.currencyCode).toBe('YER');
    expect(profile.defaultTaxRate).toBe(0);
    expect(profile.zatcaEnabled).toBe(false);
  });

  it('should fallback to SA profile on invalid/null country code', () => {
    const defaultProfile = getDefaultCountryProfile();
    expect(defaultProfile.code).toBe('SA');

    const resolvedNull = getCountryProfile(null);
    expect(resolvedNull.code).toBe('SA');

    const resolvedInvalid = getCountryProfile('UNKNOWN' as any);
    expect(resolvedInvalid.code).toBe('SA');
  });

  describe('Commercial Registration Validation', () => {
    it('should validate Saudi commercial registration (exactly 10 digits)', () => {
      // Saudi valid
      expect(validateCommercialRegistration('SA', '1010123456')).toEqual({ isValid: true });
      expect(validateCommercialRegistration('SA', '10101 23456')).toEqual({ isValid: true }); // ignores whitespace

      // Saudi invalid
      expect(validateCommercialRegistration('SA', '')).toEqual({
        isValid: false,
        errorAr: 'رقم السجل التجاري مطلوب.'
      });
      expect(validateCommercialRegistration('SA', '123')).toEqual({
        isValid: false,
        errorAr: 'رقم السجل التجاري السعودي يجب أن يتكون من 10 أرقام.'
      });
      expect(validateCommercialRegistration('SA', 'abcdefghij')).toEqual({
        isValid: false,
        errorAr: 'رقم السجل التجاري السعودي يجب أن يتكون من 10 أرقام.'
      });
    });

    it('should skip commercial registration validation for Yemen or other countries', () => {
      expect(validateCommercialRegistration('YE', '')).toEqual({ isValid: true });
      expect(validateCommercialRegistration('YE', '123')).toEqual({ isValid: true });
    });
  });

  describe('Tax Number (VAT) Validation', () => {
    it('should validate Saudi Tax Number when VAT registered (starts and ends with 3, total 15 digits)', () => {
      // Saudi valid (Starts/ends with 3, 15 digits total)
      expect(validateTaxNumber('SA', '312345678901233', true)).toEqual({ isValid: true });
      expect(validateTaxNumber('SA', '31234567890123 3', true)).toEqual({ isValid: true }); // ignores whitespace

      // Saudi invalid
      expect(validateTaxNumber('SA', '', true)).toEqual({
        isValid: false,
        errorAr: 'الرقم الضريبي مطلوب للمنشآت المسجلة في ضريبة القيمة المضافة.'
      });
      expect(validateTaxNumber('SA', '112345678901233', true)).toEqual({
        isValid: false,
        errorAr: 'الرقم الضريبي السعودي يجب أن يتكون من 15 رقم يبدأ بـ 3 وينتهي بـ 3.'
      });
      expect(validateTaxNumber('SA', '312345678901234', true)).toEqual({
        isValid: false,
        errorAr: 'الرقم الضريبي السعودي يجب أن يتكون من 15 رقم يبدأ بـ 3 وينتهي بـ 3.'
      });
    });

    it('should skip tax number validation if not VAT registered or for non-SA countries', () => {
      expect(validateTaxNumber('SA', '', false)).toEqual({ isValid: true });
      expect(validateTaxNumber('YE', '123456', true)).toEqual({ isValid: true });
    });
  });

  describe('Phone Number Validation', () => {
    it('should validate Saudi phone numbers correctly', () => {
      expect(validatePhone('SA', '0512345678')).toEqual({ isValid: true });
      expect(validatePhone('SA', '512345678')).toEqual({ isValid: true });
      expect(validatePhone('SA', '966512345678')).toEqual({ isValid: true });
      expect(validatePhone('SA', '+966 512345678')).toEqual({ isValid: true });

      // Invalid SA
      const saInvalidResult = validatePhone('SA', '0612345678');
      expect(saInvalidResult.isValid).toBe(false);
      expect(saInvalidResult.errorAr).toContain('يجب أن يبدأ بـ 05');
    });

    it('should validate Yemeni phone numbers correctly', () => {
      expect(validatePhone('YE', '712345678')).toEqual({ isValid: true });
      expect(validatePhone('YE', '967712345678')).toEqual({ isValid: true });
      expect(validatePhone('YE', '12345678')).toEqual({ isValid: true });

      // Invalid YE
      const yeInvalidResult = validatePhone('YE', 'abc');
      expect(yeInvalidResult.isValid).toBe(false);
      expect(yeInvalidResult.errorAr).toContain('رقم الجوال اليمني غير صحيح');
    });
  });

  describe('Organization Default Tax Rate Resolution', () => {
    it('should return 0 if organization is not provided', () => {
      expect(getOrgDefaultTaxRate(null)).toBe(0);
      expect(getOrgDefaultTaxRate(undefined)).toBe(0);
    });

    it('should return 0 if is_vat_registered is explicitly false', () => {
      expect(getOrgDefaultTaxRate({ is_vat_registered: false })).toBe(0);
    });

    it('should return default_tax_rate if explicitly specified in organization settings', () => {
      expect(getOrgDefaultTaxRate({ is_vat_registered: true, default_tax_rate: 5 })).toBe(5);
    });

    it('should return fallback country tax rate if default_tax_rate is not specified', () => {
      expect(getOrgDefaultTaxRate({ is_vat_registered: true, country_code: 'SA', default_tax_rate: null })).toBe(15);
      expect(getOrgDefaultTaxRate({ is_vat_registered: true, country_code: 'YE', default_tax_rate: null })).toBe(0);
    });
  });
});
