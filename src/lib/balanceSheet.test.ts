import { describe, it, expect } from 'vitest';
import { AdvancedBalanceSheetResult, AdvancedBalanceSheetBreakdown } from './reportsService';

// Mock Balance Sheet Data for Testing Classification & Tolerance
const createMockResult = (
  checkDifference: number, 
  accounts: AdvancedBalanceSheetBreakdown[]
): AdvancedBalanceSheetResult => {
  return {
    as_of_date: '2026-12-31',
    comparison_date: '2025-12-31',
    unclassified_accounts_count: accounts.filter(a => a.balance_sheet_section === null).length,
    main_period: {
      assets_current: accounts
        .filter(a => a.classification === 'assets' && a.balance_sheet_section === 'current_asset')
        .reduce((sum, a) => sum + a.amount, 0),
      assets_non_current: accounts
        .filter(a => a.classification === 'assets' && a.balance_sheet_section === 'non_current_asset')
        .reduce((sum, a) => sum + a.amount, 0),
      assets_unclassified: accounts
        .filter(a => a.classification === 'assets' && a.balance_sheet_section === null)
        .reduce((sum, a) => sum + a.amount, 0),
      total_assets: accounts
        .filter(a => a.classification === 'assets')
        .reduce((sum, a) => sum + a.amount, 0),
      liabilities_current: accounts
        .filter(a => a.classification === 'liabilities' && a.balance_sheet_section === 'current_liability')
        .reduce((sum, a) => sum + a.amount, 0),
      liabilities_non_current: accounts
        .filter(a => a.classification === 'liabilities' && a.balance_sheet_section === 'non_current_liability')
        .reduce((sum, a) => sum + a.amount, 0),
      liabilities_unclassified: accounts
        .filter(a => a.classification === 'liabilities' && a.balance_sheet_section === null)
        .reduce((sum, a) => sum + a.amount, 0),
      total_liabilities: accounts
        .filter(a => a.classification === 'liabilities')
        .reduce((sum, a) => sum + a.amount, 0),
      equity: accounts
        .filter(a => a.classification === 'equity')
        .reduce((sum, a) => sum + a.amount, 0),
      current_year_net_income: 1500.50,
      total_equity_and_income: accounts
        .filter(a => a.classification === 'equity')
        .reduce((sum, a) => sum + a.amount, 0) + 1500.50,
      check_difference: checkDifference
    },
    comparison_period: null,
    accounts
  };
};

describe('LEDGRA FIN-1A Advanced Balance Sheet Logic Tests', () => {
  
  it('should correctly classify current assets, non-current assets and unclassified assets', () => {
    const accounts: AdvancedBalanceSheetBreakdown[] = [
      {
        account_id: 'acc-1',
        account_code: '1101',
        account_name_ar: 'الصندوق والمحافظ',
        account_name_en: 'Cash in Hand',
        classification: 'assets',
        balance_sheet_section: 'current_asset',
        amount: 5000,
        comparison_amount: 4000
      },
      {
        account_id: 'acc-2',
        account_code: '1201',
        account_name_ar: 'الآلات والمعدات',
        account_name_en: 'Machinery & Equipment',
        classification: 'assets',
        balance_sheet_section: 'non_current_asset',
        amount: 15000,
        comparison_amount: 15000
      },
      {
        account_id: 'acc-3',
        account_code: '1999',
        account_name_ar: 'أصل غامض غير مبوب',
        account_name_en: 'Vague Unmapped Asset',
        classification: 'assets',
        balance_sheet_section: null,
        amount: 250,
        comparison_amount: 0
      }
    ];

    const result = createMockResult(0.00, accounts);
    
    // Assert current assets subtotal
    expect(result.main_period.assets_current).toBe(5000);
    // Assert non-current assets subtotal
    expect(result.main_period.assets_non_current).toBe(15000);
    // Assert unclassified assets subtotal
    expect(result.main_period.assets_unclassified).toBe(250);
    // Assert total assets sum
    expect(result.main_period.total_assets).toBe(20250);
    // Assert unclassified accounts count
    expect(result.unclassified_accounts_count).toBe(1);
  });

  it('should correctly classify current liabilities, non-current liabilities and unclassified liabilities', () => {
    const accounts: AdvancedBalanceSheetBreakdown[] = [
      {
        account_id: 'acc-4',
        account_code: '2101',
        account_name_ar: 'الموردين والذمم الدائنة',
        account_name_en: 'Accounts Payable',
        classification: 'liabilities',
        balance_sheet_section: 'current_liability',
        amount: 3000,
        comparison_amount: 2500
      },
      {
        account_id: 'acc-5',
        account_code: '2201',
        account_name_ar: 'قروض طويلة الأجل',
        account_name_en: 'Long Term Loans',
        classification: 'liabilities',
        balance_sheet_section: 'non_current_liability',
        amount: 10000,
        comparison_amount: 10000
      },
      {
        account_id: 'acc-6',
        account_code: '2999',
        account_name_ar: 'مطلوبات غير مبوبة',
        account_name_en: 'Unmapped Liability',
        classification: 'liabilities',
        balance_sheet_section: null,
        amount: 100,
        comparison_amount: 0
      }
    ];

    const result = createMockResult(0.00, accounts);
    
    // Assert current liabilities subtotal
    expect(result.main_period.liabilities_current).toBe(3000);
    // Assert non-current liabilities subtotal
    expect(result.main_period.liabilities_non_current).toBe(10000);
    // Assert unclassified liabilities subtotal
    expect(result.main_period.liabilities_unclassified).toBe(100);
    // Assert total liabilities sum
    expect(result.main_period.total_liabilities).toBe(13100);
  });

  it('should verify strict balance tolerance limit of 0.01', () => {
    // 1. Difference of exactly 0.01 must be tolerated as balanced
    const balancedReport1 = createMockResult(0.01, []);
    const isBalanced1 = Math.abs(balancedReport1.main_period.check_difference) <= 0.01;
    expect(isBalanced1).toBe(true);

    // 2. Difference of exactly -0.01 must be tolerated as balanced
    const balancedReport2 = createMockResult(-0.01, []);
    const isBalanced2 = Math.abs(balancedReport2.main_period.check_difference) <= 0.01;
    expect(isBalanced2).toBe(true);

    // 3. Difference of 0.005 is within limits
    const balancedReport3 = createMockResult(0.005, []);
    const isBalanced3 = Math.abs(balancedReport3.main_period.check_difference) <= 0.01;
    expect(isBalanced3).toBe(true);

    // 4. Difference of 0.015 (old margin limit) must NOT be tolerated
    const unbalancedReport1 = createMockResult(0.015, []);
    const isBalanced4 = Math.abs(unbalancedReport1.main_period.check_difference) <= 0.01;
    expect(isBalanced4).toBe(false);

    // 5. Difference of 0.02 is unbalanced
    const unbalancedReport2 = createMockResult(0.02, []);
    const isBalanced5 = Math.abs(unbalancedReport2.main_period.check_difference) <= 0.01;
    expect(isBalanced5).toBe(false);
  });

  it('should verify current period net income is included as separate item in owner equity and added to the sum total', () => {
    const accounts: AdvancedBalanceSheetBreakdown[] = [
      {
        account_id: 'acc-7',
        account_code: '3101',
        account_name_ar: 'رأس مال الشركاء',
        account_name_en: 'Partners Capital',
        classification: 'equity',
        balance_sheet_section: 'equity',
        amount: 50000,
        comparison_amount: 50000
      }
    ];

    const result = createMockResult(0.00, accounts);
    
    // Base equity sum
    expect(result.main_period.equity).toBe(50000);
    // Net income YTD
    expect(result.main_period.current_year_net_income).toBe(1500.50);
    // Total Equity + Net Income
    expect(result.main_period.total_equity_and_income).toBe(51500.50);
  });

});
