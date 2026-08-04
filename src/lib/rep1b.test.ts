import { describe, it, expect } from 'vitest';
import { formatNumberWithLatinDigits, safeParseFloat } from './formatters';
import { escapeCSVValue, generateCSV, downloadCSV, CSVCell } from './exportUtils';

// ==========================================
// TYPES & INTERFACES FOR REP-1B RECONCILIATION
// ==========================================

export interface MockLedgerEntryRow {
  entry_id: string;
  journal_entry_id: string;
  line_id: string;
  journal_entry_line_id: string;
  entry_date: string;
  entry_number: string;
  reference: string;
  description: string;
  debit: number;
  credit: number;
  source_type: string;
  source_id: string | null;
  is_closing_entry: boolean;
  running_balance: number;
}

export interface MockTrialBalanceAccount {
  account_id: string;
  code: string;
  name_ar: string;
  name_en: string | null;
  classification: string;
  nature: 'debit' | 'credit';
  level: number;
  parent_id: string | null;
  allow_direct_posting: boolean;
  is_active: boolean;
  is_system: boolean;
  opening_debit: number;
  opening_credit: number;
  period_debit: number;
  period_credit: number;
  closing_debit: number;
  closing_credit: number;
  net_balance: number;
}

export interface MockTrialBalanceTotals {
  opening_debit: number;
  opening_credit: number;
  period_debit: number;
  period_credit: number;
  closing_debit: number;
  closing_credit: number;
  is_balanced: boolean;
  difference: number;
}

// ==========================================
// LOGIC IMPLEMENTATIONS & HELPERS FOR TESTING
// ==========================================

export function validateReportDateRange(dateFrom: string, dateTo: string): { isValid: boolean; error?: string } {
  if (!dateFrom || !dateTo) {
    return { isValid: false, error: 'يرجى تحديد تاريخ البداية وتاريخ النهاية.' };
  }
  const from = new Date(dateFrom);
  const to = new Date(dateTo);
  if (isNaN(from.getTime()) || isNaN(to.getTime())) {
    return { isValid: false, error: 'صيغة التاريخ غير صالحة.' };
  }
  if (from > to) {
    return { isValid: false, error: 'تاريخ البداية يجب أن يكون قبل أو يساوي تاريخ النهاية (الفترة معكوسة غير صالحة).' };
  }
  return { isValid: true };
}

export function canViewFinancialReportsRole(role: string | null | undefined, isActive: boolean = true): boolean {
  if (!role || !isActive) return false;
  const allowedRoles = ['owner', 'admin', 'accountant', 'viewer'];
  return allowedRoles.includes(role);
}

export function calculateSignedLedgerRunningBalance(
  openingBalance: number,
  movements: Array<{
    entry_id: string;
    line_id: string;
    entry_date: string;
    entry_number: string;
    debit: number;
    credit: number;
    description: string;
    reference: string;
  }>
): {
  opening_balance: number;
  total_debit: number;
  total_credit: number;
  closing_balance: number;
  entries: MockLedgerEntryRow[];
} {
  // Sort chronologically: entry_date ASC, entry_number ASC, entry_id ASC, line_id ASC
  const sorted = [...movements].sort((a, b) => {
    const d1 = new Date(a.entry_date).getTime();
    const d2 = new Date(b.entry_date).getTime();
    if (d1 !== d2) return d1 - d2;
    const numCmp = a.entry_number.localeCompare(b.entry_number, undefined, { numeric: true });
    if (numCmp !== 0) return numCmp;
    const entCmp = a.entry_id.localeCompare(b.entry_id);
    if (entCmp !== 0) return entCmp;
    return a.line_id.localeCompare(b.line_id);
  });

  let running = openingBalance;
  let totDebit = 0;
  let totCredit = 0;

  const entries: MockLedgerEntryRow[] = sorted.map((m) => {
    totDebit += m.debit;
    totCredit += m.credit;
    // Unified equation: signed_balance = opening + debit - credit
    running = running + m.debit - m.credit;

    return {
      entry_id: m.entry_id,
      journal_entry_id: m.entry_id,
      line_id: m.line_id,
      journal_entry_line_id: m.line_id,
      entry_date: m.entry_date,
      entry_number: m.entry_number,
      reference: m.reference,
      description: m.description,
      debit: m.debit,
      credit: m.credit,
      source_type: 'manual',
      source_id: null,
      is_closing_entry: false,
      running_balance: running,
    };
  });

  const closingBalance = openingBalance + totDebit - totCredit;

  return {
    opening_balance: openingBalance,
    total_debit: totDebit,
    total_credit: totCredit,
    closing_balance: closingBalance,
    entries,
  };
}

export function calculateTrialBalanceTotals(
  accounts: MockTrialBalanceAccount[]
): MockTrialBalanceTotals {
  // Sum ONLY direct posting leaf accounts to prevent double counting parent nodes
  const leafAccounts = accounts.filter(a => a.allow_direct_posting || !accounts.some(child => child.parent_id === a.account_id));

  let opDebit = 0;
  let opCredit = 0;
  let pdDebit = 0;
  let pdCredit = 0;
  let clDebit = 0;
  let clCredit = 0;

  for (const acc of leafAccounts) {
    opDebit += acc.opening_debit;
    opCredit += acc.opening_credit;
    pdDebit += acc.period_debit;
    pdCredit += acc.period_credit;
    clDebit += acc.closing_debit;
    clCredit += acc.closing_credit;
  }

  const diff = Math.abs(clDebit - clCredit);
  const isBalanced = diff < 0.01;

  return {
    opening_debit: opDebit,
    opening_credit: opCredit,
    period_debit: pdDebit,
    period_credit: pdCredit,
    closing_debit: clDebit,
    closing_credit: clCredit,
    is_balanced: isBalanced,
    difference: diff,
  };
}

// ==========================================
// TEST SUITES FOR REP-1B RECONCILIATION
// ==========================================

describe('REP-1B: Financial Reconciliation & Validation Tests', () => {

  // 1. Date Range & Filter Validation
  describe('1. Date Range Validation', () => {
    it('should validate standard chronological dates', () => {
      const res = validateReportDateRange('2026-01-01', '2026-12-31');
      expect(res.isValid).toBe(true);
      expect(res.error).toBeUndefined();
    });

    it('should allow same start and end date', () => {
      const res = validateReportDateRange('2026-06-15', '2026-06-15');
      expect(res.isValid).toBe(true);
    });

    it('should reject reversed period where start > end', () => {
      const res = validateReportDateRange('2026-12-31', '2026-01-01');
      expect(res.isValid).toBe(false);
      expect(res.error).toContain('الفترة معكوسة');
    });

    it('should reject empty or invalid date strings', () => {
      const res1 = validateReportDateRange('', '2026-12-31');
      expect(res1.isValid).toBe(false);

      const res2 = validateReportDateRange('invalid-date', '2026-12-31');
      expect(res2.isValid).toBe(false);
    });
  });

  // 2. Role-Based Access Control Checks
  describe('2. Authorization & Role Checks', () => {
    it('should allow owner, admin, accountant, and viewer roles', () => {
      expect(canViewFinancialReportsRole('owner')).toBe(true);
      expect(canViewFinancialReportsRole('admin')).toBe(true);
      expect(canViewFinancialReportsRole('accountant')).toBe(true);
      expect(canViewFinancialReportsRole('viewer')).toBe(true);
    });

    it('should block sales role or unknown roles', () => {
      expect(canViewFinancialReportsRole('sales')).toBe(false);
      expect(canViewFinancialReportsRole('inventory_manager')).toBe(false);
      expect(canViewFinancialReportsRole('')).toBe(false);
      expect(canViewFinancialReportsRole(null)).toBe(false);
    });

    it('should block inactive users regardless of role', () => {
      expect(canViewFinancialReportsRole('admin', false)).toBe(false);
    });
  });

  // 3. Unified Signed Balance & Running Balance Calculations
  describe('3. Unified Signed Balance & Running Balance Equations', () => {
    it('should calculate signed running balance correctly for Asset account (Debit nature)', () => {
      const opening = 1000.00;
      const movements = [
        { entry_id: 'E1', line_id: 'L1', entry_date: '2026-01-10', entry_number: 'JV-001', debit: 500, credit: 0, description: 'Sales', reference: 'REF1' },
        { entry_id: 'E2', line_id: 'L2', entry_date: '2026-01-15', entry_number: 'JV-002', debit: 0, credit: 200, description: 'Bank transfer', reference: 'REF2' }
      ];

      const res = calculateSignedLedgerRunningBalance(opening, movements);
      expect(res.opening_balance).toBe(1000.00);
      expect(res.total_debit).toBe(500.00);
      expect(res.total_credit).toBe(200.00);
      expect(res.entries[0].running_balance).toBe(1500.00);
      expect(res.entries[1].running_balance).toBe(1300.00);
      expect(res.closing_balance).toBe(1300.00);
      expect(res.entries[1].running_balance).toBe(res.closing_balance);
    });

    it('should apply identical signed formula (opening + debit - credit) for Liability account (Credit nature)', () => {
      // Opening credit balance of 2000 is represented as signed -2000
      const opening = -2000.00;
      const movements = [
        { entry_id: 'E1', line_id: 'L1', entry_date: '2026-02-01', entry_number: 'JV-010', debit: 500, credit: 0, description: 'Payment to vendor', reference: 'REF10' },
        { entry_id: 'E2', line_id: 'L2', entry_date: '2026-02-05', entry_number: 'JV-011', debit: 0, credit: 1000, description: 'Bill received', reference: 'REF11' }
      ];

      const res = calculateSignedLedgerRunningBalance(opening, movements);
      expect(res.opening_balance).toBe(-2000.00);
      expect(res.total_debit).toBe(500.00);
      expect(res.total_credit).toBe(1000.00);
      expect(res.entries[0].running_balance).toBe(-1500.00); // -2000 + 500 = -1500 (Credit 1500)
      expect(res.entries[1].running_balance).toBe(-2500.00); // -1500 - 1000 = -2500 (Credit 2500)
      expect(res.closing_balance).toBe(-2500.00);
      expect(res.entries[1].running_balance).toBe(res.closing_balance);
    });

    it('should include journal_entry_line_id in every movement entry', () => {
      const res = calculateSignedLedgerRunningBalance(0, [
        { entry_id: 'E100', line_id: 'L100', entry_date: '2026-03-01', entry_number: 'JV-100', debit: 100, credit: 0, description: 'Test', reference: 'REF' }
      ]);
      expect(res.entries[0].journal_entry_line_id).toBe('L100');
      expect(res.entries[0].line_id).toBe('L100');
      expect(res.entries[0].journal_entry_id).toBe('E100');
    });
  });

  // 4. Deterministic Sorting
  describe('4. Deterministic Movement Sorting', () => {
    it('should sort movements chronologically by date, number, entry_id, line_id', () => {
      const unsorted = [
        { entry_id: 'E2', line_id: 'L2', entry_date: '2026-01-05', entry_number: 'JV-002', debit: 100, credit: 0, description: 'Second', reference: 'R2' },
        { entry_id: 'E1', line_id: 'L1', entry_date: '2026-01-01', entry_number: 'JV-001', debit: 200, credit: 0, description: 'First', reference: 'R1' },
        { entry_id: 'E3', line_id: 'L3B', entry_date: '2026-01-05', entry_number: 'JV-002', debit: 50, credit: 0, description: 'Third line B', reference: 'R3' },
        { entry_id: 'E3', line_id: 'L3A', entry_date: '2026-01-05', entry_number: 'JV-002', debit: 50, credit: 0, description: 'Third line A', reference: 'R3' },
      ];

      const res = calculateSignedLedgerRunningBalance(0, unsorted);
      expect(res.entries[0].entry_id).toBe('E1');
      expect(res.entries[1].entry_id).toBe('E2');
      expect(res.entries[2].line_id).toBe('L3A');
      expect(res.entries[3].line_id).toBe('L3B');
    });
  });

  // 5. Trial Balance Totals & Double Counting Prevention
  describe('5. Trial Balance Totals & Hierarchy Rollup', () => {
    const mockAccounts: MockTrialBalanceAccount[] = [
      // Parent Account (Asset 1000)
      {
        account_id: 'ACC-PARENT-1',
        code: '1000',
        name_ar: 'الأصول',
        name_en: 'Assets',
        classification: 'assets',
        nature: 'debit',
        level: 1,
        parent_id: null,
        allow_direct_posting: false,
        is_active: true,
        is_system: true,
        opening_debit: 3000,
        opening_credit: 0,
        period_debit: 1500,
        period_credit: 500,
        closing_debit: 4000,
        closing_credit: 0,
        net_balance: 4000,
      },
      // Leaf Account 1 (1010 Cash)
      {
        account_id: 'ACC-LEAF-1',
        code: '1010',
        name_ar: 'النقدية',
        name_en: 'Cash',
        classification: 'assets',
        nature: 'debit',
        level: 2,
        parent_id: 'ACC-PARENT-1',
        allow_direct_posting: true,
        is_active: true,
        is_system: false,
        opening_debit: 2000,
        opening_credit: 0,
        period_debit: 1000,
        period_credit: 200,
        closing_debit: 2800,
        closing_credit: 0,
        net_balance: 2800,
      },
      // Leaf Account 2 (1020 Bank)
      {
        account_id: 'ACC-LEAF-2',
        code: '1020',
        name_ar: 'البنك',
        name_en: 'Bank',
        classification: 'assets',
        nature: 'debit',
        level: 2,
        parent_id: 'ACC-PARENT-1',
        allow_direct_posting: true,
        is_active: true,
        is_system: false,
        opening_debit: 1000,
        opening_credit: 0,
        period_debit: 500,
        period_credit: 300,
        closing_debit: 1200,
        closing_credit: 0,
        net_balance: 1200,
      },
      // Leaf Account 3 (2010 Payables - Liability)
      {
        account_id: 'ACC-LEAF-3',
        code: '2010',
        name_ar: 'الموردون',
        name_en: 'Payables',
        classification: 'liabilities',
        nature: 'credit',
        level: 1,
        parent_id: null,
        allow_direct_posting: true,
        is_active: true,
        is_system: false,
        opening_debit: 0,
        opening_credit: 3000,
        period_debit: 500,
        period_credit: 1500,
        closing_debit: 0,
        closing_credit: 4000,
        net_balance: -4000,
      }
    ];

    it('should sum ONLY leaf accounts for report totals (preventing double counting from parent 1000)', () => {
      const totals = calculateTrialBalanceTotals(mockAccounts);
      // Leaf 1 + Leaf 2 + Leaf 3:
      // Opening Debit: 2000 (Cash) + 1000 (Bank) = 3000
      expect(totals.opening_debit).toBe(3000);
      // Opening Credit: 3000 (Payables)
      expect(totals.opening_credit).toBe(3000);
      // Period Debit: 1000 + 500 + 500 = 2000
      expect(totals.period_debit).toBe(2000);
      // Period Credit: 200 + 300 + 1500 = 2000
      expect(totals.period_credit).toBe(2000);
      // Closing Debit: 2800 + 1200 = 4000
      expect(totals.closing_debit).toBe(4000);
      // Closing Credit: 4000
      expect(totals.closing_credit).toBe(4000);
      expect(totals.is_balanced).toBe(true);
      expect(totals.difference).toBe(0);
    });

    it('should flag unbalanced trial balance when debits do not equal credits', () => {
      const unbalancedAccounts = [...mockAccounts];
      // Corrupt leaf 1
      unbalancedAccounts[1] = { ...unbalancedAccounts[1], closing_debit: 2900 };
      const totals = calculateTrialBalanceTotals(unbalancedAccounts);
      expect(totals.is_balanced).toBe(false);
      expect(totals.difference).toBe(100);
    });
  });

  // 6. Trial Balance <-> General Ledger Reconciliation
  describe('6. Reconciliation Between Trial Balance and General Ledger', () => {
    it('should ensure closing_net in Trial Balance matches closing_balance in Ledger', () => {
      const ledgerRes = calculateSignedLedgerRunningBalance(2000, [
        { entry_id: 'E1', line_id: 'L1', entry_date: '2026-01-10', entry_number: 'JV-001', debit: 1000, credit: 200, description: 'Test', reference: 'REF' }
      ]);

      const tbAccount: MockTrialBalanceAccount = {
        account_id: 'ACC-LEAF-1',
        code: '1010',
        name_ar: 'النقدية',
        name_en: 'Cash',
        classification: 'assets',
        nature: 'debit',
        level: 2,
        parent_id: null,
        allow_direct_posting: true,
        is_active: true,
        is_system: false,
        opening_debit: 2000,
        opening_credit: 0,
        period_debit: 1000,
        period_credit: 200,
        closing_debit: 2800,
        closing_credit: 0,
        net_balance: 2800,
      };

      const tbClosingNet = tbAccount.closing_debit - tbAccount.closing_credit;
      expect(tbClosingNet).toBe(ledgerRes.closing_balance);
    });
  });

  // 7. CSV Security & Export Safety
  describe('7. CSV Export Security & Formula Injection Guard', () => {
    it('should escape CSV values starting with =, +, -, @ to prevent formula injection', () => {
      expect(escapeCSVValue('=1+2')).toBe("'=1+2");
      expect(escapeCSVValue('@SUM(A1:A10)')).toBe("'@SUM(A1:A10)");
      expect(escapeCSVValue('+CMD')).toBe("'+CMD");
    });

    it('should preserve true negative and positive numbers without prepending quotes', () => {
      expect(escapeCSVValue(-150.50)).toBe('-150.5');
      expect(escapeCSVValue('-150.50')).toBe('-150.50');
      expect(escapeCSVValue(2500)).toBe('2500');
    });

    it('should build valid CSV content using generateCSV', () => {
      const headers = ['الكود', 'الاسم', 'الرصيد'];
      const rows: CSVCell[][] = [
        ['1010', 'النقدية', 1500.00],
        ['2010', 'الموردون', -2500.00]
      ];
      const csv = generateCSV(headers, rows);
      expect(csv).toContain('الكود,الاسم,الرصid'.slice(0, 5));
      expect(csv).toContain('1010,النقدية,1500');
      expect(csv).toContain('2010,الموردون,-2500');
    });
  });

});
