import { describe, it, expect } from 'vitest';
import {
  toEnglishDigits,
  formatNumberWithLatinDigits,
  normalizeInputDigits,
  normalizeIntegerInput,
  normalizeDecimalInput,
  removeThousandsSeparator,
  safeParseFloat,
  safeParseInt,
  getOrgCurrency,
  formatArabicDateWithLatinDigits
} from './formatters';

describe('Formatters and Number Normalizations', () => {
  describe('toEnglishDigits', () => {
    it('should convert Arabic-Indic and Persian digits to standard English digits', () => {
      expect(toEnglishDigits('٠١٢٣٤٥٦٧٨٩')).toBe('0123456789');
      expect(toEnglishDigits('۰۱۲۳۴۵۶۷۸۹')).toBe('0123456789');
      expect(toEnglishDigits('١٢.٣٤')).toBe('12.34');
      expect(toEnglishDigits('١٢٫٣٤')).toBe('12.34'); // with Arabic decimal separator
      expect(toEnglishDigits('١٬٢٣٤٫٥٦')).toBe('1,234.56'); // with Arabic thousands and decimal separators
    });

    it('should handle null and undefined safely', () => {
      expect(toEnglishDigits(null)).toBe('');
      expect(toEnglishDigits(undefined)).toBe('');
    });
  });

  describe('formatNumberWithLatinDigits', () => {
    it('should format numbers with standard decimal places using English digits', () => {
      expect(formatNumberWithLatinDigits(123.456, 2)).toBe('123.46');
      expect(formatNumberWithLatinDigits('١٢٣٫٤٥٦', 2)).toBe('123.46');
      expect(formatNumberWithLatinDigits(0, 2)).toBe('0.00');
    });

    it('should handle null, undefined, empty string, and infinite values', () => {
      expect(formatNumberWithLatinDigits(null)).toBe('0.00');
      expect(formatNumberWithLatinDigits(undefined)).toBe('0.00');
      expect(formatNumberWithLatinDigits('')).toBe('0.00');
      expect(formatNumberWithLatinDigits(Infinity)).toBe('0.00');
    });
  });

  describe('normalizeDecimalInput', () => {
    it('should strip out thousands commas and keep standard floating format', () => {
      expect(normalizeDecimalInput('1,234.56')).toBe('1234.56');
      expect(normalizeDecimalInput('١٬٢٣٤٫٥٦')).toBe('1234.56');
    });

    it('should handle negative values correctly with negative prefix only', () => {
      expect(normalizeDecimalInput('-123.45')).toBe('-123.45');
      expect(normalizeDecimalInput('123.-45')).toBe('123.45');
    });

    it('should allow at most one decimal period', () => {
      expect(normalizeDecimalInput('12.34.56')).toBe('12.3456');
    });

    it('should handle null and empty values', () => {
      expect(normalizeDecimalInput(null)).toBe('');
      expect(normalizeDecimalInput(undefined)).toBe('');
    });
  });

  describe('safeParseFloat and safeParseInt', () => {
    it('should parse floats safely without throwing NaN or Infinity', () => {
      expect(safeParseFloat('1,234.56')).toBe(1234.56);
      expect(safeParseFloat('abc')).toBe(0);
      expect(safeParseFloat(null)).toBe(0);
      expect(safeParseFloat(undefined)).toBe(0);
      expect(safeParseFloat(15.25)).toBe(15.25);
    });

    it('should parse integers safely without throwing NaN or Infinity', () => {
      expect(safeParseInt('123')).toBe(123);
      expect(safeParseInt('123.99')).toBe(123);
      expect(safeParseInt('-123.99')).toBe(-123);
      expect(safeParseInt('1,234.99')).toBe(1234);
      expect(safeParseInt('١٢٣٫٩٩')).toBe(123);
      expect(safeParseInt('١٬٢٣٤٫٩٩')).toBe(1234);
      expect(safeParseInt(123.99)).toBe(123);
      expect(safeParseInt(-123.99)).toBe(-123);
      expect(safeParseInt('abc')).toBe(0);
      expect(safeParseInt(null)).toBe(0);
      expect(safeParseInt(undefined)).toBe(0);
      expect(safeParseInt(NaN)).toBe(0);
      expect(safeParseInt(Infinity)).toBe(0);
      expect(safeParseInt(-Infinity)).toBe(0);
      expect(safeParseInt('Infinity')).toBe(0);
      expect(safeParseInt('-Infinity')).toBe(0);
      
      // Separate numbers should not be merged into a single large number
      expect(safeParseInt('12 34')).toBe(12);
      expect(safeParseInt('abc 123')).toBe(0);
    });
  });

  describe('getOrgCurrency', () => {
    it('should resolve organization currency code or default to empty string', () => {
      expect(getOrgCurrency({ currency_code: 'SAR' })).toBe('SAR');
      expect(getOrgCurrency(null)).toBe('');
      expect(getOrgCurrency({})).toBe('');
    });
  });

  describe('formatArabicDateWithLatinDigits', () => {
    it('should format date in Arabic locale but output English digits', () => {
      const date = new Date('2026-07-12');
      const formatted = formatArabicDateWithLatinDigits(date, { year: 'numeric', month: 'numeric', day: 'numeric' }, 'ar-SA');
      
      // Ensure there are no Arabic digits like ٠١٢٣٤٥٦٧٨٩
      expect(formatted).not.toMatch(/[٠-٩]/);
      // Ensure it contains standard numerals
      expect(formatted).toMatch(/[0-9]/);
    });
  });
});
