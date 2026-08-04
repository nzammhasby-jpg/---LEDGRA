import { describe, it, expect } from 'vitest';
import {
  decomposeBalanceSide,
  calculateSignedBalance,
  calculateTrialBalanceTotals,
  reconcileLedgerAndTrialBalance,
  reconcileCustomerVendorWithLedger
} from './rep1bHelpers';
import { TrialBalanceAccount, LedgerReportResult } from './reportsService';

describe('REP-1B Ledger & Trial Balance Reconciliation Unit Tests', () => {

  describe('1. Balance Side Decomposition', () => {
    it('should decompose positive net balance as debit', () => {
      const res = decomposeBalanceSide(1500.50);
      expect(res.side).toBe('debit');
      expect(res.debit).toBe(1500.50);
      expect(res.credit).toBe(0);
    });

    it('should decompose negative net balance as credit', () => {
      const res = decomposeBalanceSide(-2500.75);
      expect(res.side).toBe('credit');
      expect(res.debit).toBe(0);
      expect(res.credit).toBe(2500.75);
    });

    it('should decompose zero or near-zero balance as zero', () => {
      const res1 = decomposeBalanceSide(0.001);
      expect(res1.side).toBe('zero');
      expect(res1.debit).toBe(0);
      expect(res1.credit).toBe(0);

      const res2 = decomposeBalanceSide(-0.004);
      expect(res2.side).toBe('zero');
    });
  });

  describe('2. Unified Signed Balance Equation', () => {
    it('should calculate signed balance = opening + debit - credit', () => {
      expect(calculateSignedBalance(1000, 500, 200)).toBe(1300);
      expect(calculateSignedBalance(-2000, 300, 800)).toBe(-2500);
      expect(calculateSignedBalance(0, 0, 0)).toBe(0);
    });
  });

  describe('3. Trial Balance Totals Calculation', () => {
    const mockAccounts: TrialBalanceAccount[] = [
      {
        account_id: 'PARENT-1',
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
        opening_debit: 5000,
        opening_credit: 0,
        period_debit: 2000,
        period_credit: 1000,
        closing_debit: 6000,
        closing_credit: 0,
        net_balance: 6000,
      },
      {
        account_id: 'LEAF-1',
        code: '1010',
        name_ar: 'الصندوق',
        name_en: 'Cash Box',
        classification: 'assets',
        nature: 'debit',
        level: 2,
        parent_id: 'PARENT-1',
        allow_direct_posting: true,
        is_active: true,
        is_system: false,
        opening_debit: 3000,
        opening_credit: 0,
        period_debit: 1500,
        period_credit: 500,
        closing_debit: 4000,
        closing_credit: 0,
        net_balance: 4000,
      },
      {
        account_id: 'LEAF-2',
        code: '1020',
        name_ar: 'البنك الأهلي',
        name_en: 'National Bank',
        classification: 'assets',
        nature: 'debit',
        level: 2,
        parent_id: 'PARENT-1',
        allow_direct_posting: true,
        is_active: true,
        is_system: false,
        opening_debit: 2000,
        opening_credit: 0,
        period_debit: 500,
        period_credit: 500,
        closing_debit: 2000,
        closing_credit: 0,
        net_balance: 2000,
      },
      {
        account_id: 'LEAF-3',
        code: '2010',
        name_ar: 'المورد الرئيسي',
        name_en: 'Main Vendor',
        classification: 'liabilities',
        nature: 'credit',
        level: 1,
        parent_id: null,
        allow_direct_posting: true,
        is_active: true,
        is_system: false,
        opening_debit: 0,
        opening_credit: 5000,
        period_debit: 1000,
        period_credit: 2000,
        closing_debit: 0,
        closing_credit: 6000,
        net_balance: -6000,
      }
    ];

    it('should sum ONLY leaf accounts for report totals', () => {
      const totals = calculateTrialBalanceTotals(mockAccounts);
      expect(totals.opening_debit).toBe(5000);
      expect(totals.opening_credit).toBe(5000);
      expect(totals.period_debit).toBe(3000);
      expect(totals.period_credit).toBe(3000);
      expect(totals.closing_debit).toBe(6000);
      expect(totals.closing_credit).toBe(6000);
      expect(totals.is_balanced).toBe(true);
      expect(totals.difference).toBe(0);
    });

    it('should detect unbalanced state when debits and credits mismatch', () => {
      const corrupted = [...mockAccounts];
      corrupted[1] = { ...corrupted[1], closing_debit: 4500 };
      const totals = calculateTrialBalanceTotals(corrupted);
      expect(totals.is_balanced).toBe(false);
      expect(totals.difference).toBe(500);
    });
  });

  describe('4. Ledger & Trial Balance Reconciliation', () => {
    it('should reconcile matching General Ledger and Trial Balance balances', () => {
      const mockLedger: LedgerReportResult = {
        account: {
          id: 'LEAF-1',
          code: '1010',
          name_ar: 'الصندوق',
          name_en: 'Cash',
          classification: 'assets',
          nature: 'debit',
        },
        account_id: 'LEAF-1',
        account_code: '1010',
        account_name: 'الصندوق',
        date_from: '2026-01-01',
        date_to: '2026-12-31',
        fiscal_year_id: 'FY-2026',
        exclude_closing_entries: true,
        opening_balance: 3000,
        opening_debit: 3000,
        opening_credit: 0,
        period_debit: 1500,
        period_credit: 500,
        total_debit: 1500,
        total_credit: 500,
        closing_balance: 4000,
        closing_debit: 4000,
        closing_credit: 0,
        movement_count: 1,
        entries: []
      };

      const mockTBAcc: TrialBalanceAccount = {
        account_id: 'LEAF-1',
        code: '1010',
        name_ar: 'الصندوق',
        name_en: 'Cash',
        classification: 'assets',
        nature: 'debit',
        level: 2,
        parent_id: null,
        allow_direct_posting: true,
        is_active: true,
        is_system: false,
        opening_debit: 3000,
        opening_credit: 0,
        period_debit: 1500,
        period_credit: 500,
        closing_debit: 4000,
        closing_credit: 0,
        net_balance: 4000
      };

      const rec = reconcileLedgerAndTrialBalance(mockLedger, mockTBAcc);
      expect(rec.isReconciled).toBe(true);
      expect(rec.difference).toBe(0);
    });

    it('should reconcile sub-ledger customer balance with AR account balance', () => {
      const customerBalance = 12500.00;
      const arAccountClosing = 12500.00;
      const rec = reconcileCustomerVendorWithLedger(customerBalance, arAccountClosing);
      expect(rec.isReconciled).toBe(true);
      expect(rec.difference).toBe(0);
    });
  });

});
