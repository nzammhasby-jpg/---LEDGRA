import { describe, it, expect } from 'vitest';
import {
  buildLedgerReportSearchParams,
  parseLedgerReportSearchParams,
  generateSafeCSVRow
} from './rep1bHelpers';
import { escapeCSVValue, generateCSV, generateReportFilename } from './exportUtils';

describe('REP-1B Routing & CSV Export Unit Tests', () => {

  describe('1. Search Parameters Construction & Parsing', () => {
    it('should build complete URL search params with all 4 required parameters', () => {
      const spStr = buildLedgerReportSearchParams({
        accountId: 'ACC-123',
        fiscalYearId: 'FY-2026',
        dateFrom: '2026-01-01',
        dateTo: '2026-12-31'
      });

      expect(spStr).toContain('tab=ledger_report');
      expect(spStr).toContain('accountId=ACC-123');
      expect(spStr).toContain('fiscalYearId=FY-2026');
      expect(spStr).toContain('dateFrom=2026-01-01');
      expect(spStr).toContain('dateTo=2026-12-31');
    });

    it('should throw error if any required param is missing when building search params', () => {
      expect(() => buildLedgerReportSearchParams({
        accountId: '',
        fiscalYearId: 'FY-2026',
        dateFrom: '2026-01-01',
        dateTo: '2026-12-31'
      })).toThrow();

      expect(() => buildLedgerReportSearchParams({
        accountId: 'ACC-123',
        fiscalYearId: '',
        dateFrom: '2026-01-01',
        dateTo: '2026-12-31'
      })).toThrow();
    });

    it('should parse URLSearchParams and validate presence of all 4 parameters', () => {
      const url = new URLSearchParams('tab=ledger_report&accountId=ACC-123&fiscalYearId=FY-2026&dateFrom=2026-01-01&dateTo=2026-12-31');
      const parsed = parseLedgerReportSearchParams(url);

      expect(parsed.isValid).toBe(true);
      expect(parsed.accountId).toBe('ACC-123');
      expect(parsed.fiscalYearId).toBe('FY-2026');
      expect(parsed.dateFrom).toBe('2026-01-01');
      expect(parsed.dateTo).toBe('2026-12-31');
    });

    it('should parse fallback parameter names (account_id, fiscal_year_id, startDate, endDate)', () => {
      const url = new URLSearchParams('account_id=ACC-999&fiscal_year_id=FY-999&startDate=2026-02-01&endDate=2026-02-28');
      const parsed = parseLedgerReportSearchParams(url);

      expect(parsed.isValid).toBe(true);
      expect(parsed.accountId).toBe('ACC-999');
      expect(parsed.fiscalYearId).toBe('FY-999');
      expect(parsed.dateFrom).toBe('2026-02-01');
      expect(parsed.dateTo).toBe('2026-02-28');
    });

    it('should invalidate if any required search param is absent', () => {
      const url = new URLSearchParams('accountId=ACC-123&dateFrom=2026-01-01');
      const parsed = parseLedgerReportSearchParams(url);
      expect(parsed.isValid).toBe(false);
    });
  });

  describe('2. CSV Security & Export Safety', () => {
    it('should prepend single quote to string fields starting with formula characters', () => {
      expect(escapeCSVValue('=SUM(A1:A10)')).toBe("'=SUM(A1:A10)");
      expect(escapeCSVValue('+FORMULA')).toBe("'+FORMULA");
      expect(escapeCSVValue('-TEXT')).toBe("'-TEXT");
      expect(escapeCSVValue('@USER')).toBe("'@USER");
    });

    it('should NOT alter legitimate numeric negative numbers', () => {
      expect(escapeCSVValue(-500.25)).toBe('-500.25');
      expect(escapeCSVValue('-500.25')).toBe('-500.25');
    });

    it('should escape double quotes and wrap fields with commas in quotes', () => {
      expect(escapeCSVValue('حساب "العملاء"')).toBe('"حساب ""العملاء"""');
      expect(escapeCSVValue('الرياض, المملكة')).toBe('"الرياض, المملكة"');
    });

    it('should format safe CSV row via helper', () => {
      const row = generateSafeCSVRow(['1010', 'حساب الصندوق', 1500.00]);
      expect(row).toBe('1010,حساب الصندوق,1500');
    });

    it('should generate report filename correctly', () => {
      const fn = generateReportFilename('ميزان المراجعة', '2026-01-01', '2026-12-31');
      expect(fn).toContain('ledgra_ميزان_المراجعة_2026-01-01_to_2026-12-31.csv');
    });
  });

});
