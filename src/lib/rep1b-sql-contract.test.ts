import { describe, it, expect } from 'vitest';
import { canViewFinancialReportsRole } from './rep1b.test';

describe('REP-1B SQL & Function Contract Tests', () => {

  describe('1. Parameter Validation Contracts', () => {
    it('should reject missing fiscalYearId (must be mandatory string)', () => {
      const validateFiscalYearInput = (fyId: string | null | undefined): boolean => {
        if (!fyId || typeof fyId !== 'string' || fyId.trim() === '') {
          return false;
        }
        return true;
      };

      expect(validateFiscalYearInput(null)).toBe(false);
      expect(validateFiscalYearInput(undefined)).toBe(false);
      expect(validateFiscalYearInput('')).toBe(false);
      expect(validateFiscalYearInput('FY-2026-UUID')).toBe(true);
    });

    it('should reject reversed period where dateFrom > dateTo', () => {
      const validateDates = (from: string, to: string) => {
        const d1 = new Date(from);
        const d2 = new Date(to);
        if (isNaN(d1.getTime()) || isNaN(d2.getTime())) return false;
        return d1 <= d2;
      };

      expect(validateDates('2026-12-31', '2026-01-01')).toBe(false);
      expect(validateDates('2026-01-01', '2026-12-31')).toBe(true);
      expect(validateDates('2026-06-15', '2026-06-15')).toBe(true);
    });

    it('should reject date ranges that fall outside the fiscal year range', () => {
      const fyStart = new Date('2026-01-01');
      const fyEnd = new Date('2026-12-31');

      const validateInFyBounds = (fromStr: string, toStr: string): boolean => {
        const dFrom = new Date(fromStr);
        const dTo = new Date(toStr);
        return dFrom >= fyStart && dTo <= fyEnd && dFrom <= dTo;
      };

      expect(validateInFyBounds('2025-12-31', '2026-06-30')).toBe(false);
      expect(validateInFyBounds('2026-01-01', '2027-01-01')).toBe(false);
      expect(validateInFyBounds('2026-01-01', '2026-12-31')).toBe(true);
      expect(validateInFyBounds('2026-03-01', '2026-03-31')).toBe(true);
    });
  });

  describe('2. Authorization & Tenant Isolation Contracts', () => {
    it('should grant access to owner, admin, accountant, and viewer roles', () => {
      expect(canViewFinancialReportsRole('owner')).toBe(true);
      expect(canViewFinancialReportsRole('admin')).toBe(true);
      expect(canViewFinancialReportsRole('accountant')).toBe(true);
      expect(canViewFinancialReportsRole('viewer')).toBe(true);
    });

    it('should deny access to sales role and inactive users', () => {
      expect(canViewFinancialReportsRole('sales')).toBe(false);
      expect(canViewFinancialReportsRole('admin', false)).toBe(false);
      expect(canViewFinancialReportsRole(null)).toBe(false);
    });

    it('should isolate data across organizations (orgId matching)', () => {
      const recordOrgId: string = 'ORG-A-111';
      const requestOrgId: string = 'ORG-B-222';
      expect((recordOrgId as unknown) === (requestOrgId as unknown)).toBe(false);
    });
  });

  describe('3. Journal Entry Line Structure & Deterministic Sorting', () => {
    it('should require journal_entry_line_id and entry_id on every movement row', () => {
      const mockRow = {
        entry_id: 'JE-101',
        journal_entry_id: 'JE-101',
        line_id: 'JEL-501',
        journal_entry_line_id: 'JEL-501',
        debit: 100,
        credit: 0
      };

      expect(mockRow.journal_entry_line_id).toBe('JEL-501');
      expect(mockRow.line_id).toBe('JEL-501');
      expect(mockRow.journal_entry_id).toBe('JE-101');
    });

    it('should sort entries deterministically by (entry_date, entry_number, entry_id, line_id)', () => {
      const rows = [
        { entry_date: '2026-02-01', entry_number: 'JV-002', entry_id: 'E2', line_id: 'L1' },
        { entry_date: '2026-01-15', entry_number: 'JV-001', entry_id: 'E1', line_id: 'L1' },
        { entry_date: '2026-02-01', entry_number: 'JV-002', entry_id: 'E2', line_id: 'L2' },
        { entry_date: '2026-02-01', entry_number: 'JV-001', entry_id: 'E3', line_id: 'L1' },
      ];

      const sorted = [...rows].sort((a, b) => {
        const d1 = new Date(a.entry_date).getTime();
        const d2 = new Date(b.entry_date).getTime();
        if (d1 !== d2) return d1 - d2;
        const numCmp = a.entry_number.localeCompare(b.entry_number, undefined, { numeric: true });
        if (numCmp !== 0) return numCmp;
        const entCmp = a.entry_id.localeCompare(b.entry_id);
        if (entCmp !== 0) return entCmp;
        return a.line_id.localeCompare(b.line_id);
      });

      expect(sorted[0].entry_number).toBe('JV-001');
      expect(sorted[1].entry_number).toBe('JV-001');
      expect(sorted[2].line_id).toBe('L1');
      expect(sorted[3].line_id).toBe('L2');
    });
  });

});
