import { supabase } from './supabase';

export interface IncomeStatementBreakdown {
  account_id: string;
  account_code: string;
  account_name_ar: string;
  account_name_en: string | null;
  classification: 'revenue' | 'expenses';
  is_cogs: boolean;
  amount: number;
}

export interface IncomeStatementResult {
  revenue: number;
  cogs: number;
  gross_profit: number;
  expenses: number;
  net_income: number;
  accounts_breakdown: IncomeStatementBreakdown[];
}

export interface BalanceSheetBreakdown {
  account_id: string;
  account_code: string;
  account_name_ar: string;
  account_name_en: string | null;
  classification: 'assets' | 'liabilities' | 'equity';
  amount: number;
}

export interface BalanceSheetResult {
  assets: number;
  liabilities: number;
  equity: number;
  current_year_net_income: number;
  total_assets: number;
  total_liabilities: number;
  total_equity: number;
  check_difference: number;
  accounts_breakdown: BalanceSheetBreakdown[];
}

export interface CustomerMovement {
  date: string;
  journal_number: string;
  reference: string | null;
  description: string;
  debit: number;
  credit: number;
  running_balance: number;
  source_type: 'manual' | 'system';
  source_id: string | null;
}

export interface CustomerStatementResult {
  customer_code: string;
  customer_name: string;
  opening_balance: number;
  total_debit: number;
  total_credit: number;
  closing_balance: number;
  movements: CustomerMovement[];
}

export interface VendorMovement {
  date: string;
  journal_number: string;
  reference: string | null;
  description: string;
  debit: number;
  credit: number;
  running_balance: number;
  source_type: 'manual' | 'system';
  source_id: string | null;
}

export interface VendorStatementResult {
  vendor_code: string;
  vendor_name: string;
  opening_balance: number;
  total_debit: number;
  total_credit: number;
  closing_balance: number;
  movements: VendorMovement[];
}

export interface InventoryReportRow {
  item_id: string;
  item_code: string;
  item_name_ar: string;
  item_name_en: string | null;
  quantity_on_hand: number;
  average_cost: number;
  inventory_value: number;
  inventory_account_code: string | null;
  inventory_account_name: string | null;
  cogs_account_code: string | null;
  cogs_account_name: string | null;
  last_movement_at: string;
}

export const reportsService = {
  // ==========================================
  // 1. INCOME STATEMENT (قائمة الدخل)
  // ==========================================
  async getIncomeStatement(
    orgId: string,
    dateFrom: string,
    dateTo: string
  ): Promise<IncomeStatementResult> {
    const { data, error } = await supabase.rpc('get_income_statement', {
      p_org_id: orgId,
      p_date_from: dateFrom,
      p_date_to: dateTo
    });

    if (error) throw error;
    return data as IncomeStatementResult;
  },

  // ==========================================
  // 2. BALANCE SHEET (المركز المالي)
  // ==========================================
  async getBalanceSheet(
    orgId: string,
    asOfDate: string
  ): Promise<BalanceSheetResult> {
    const { data, error } = await supabase.rpc('get_balance_sheet', {
      p_org_id: orgId,
      p_as_of_date: asOfDate
    });

    if (error) throw error;
    return data as BalanceSheetResult;
  },

  // ==========================================
  // 3. CUSTOMER STATEMENT (كشف حساب عميل)
  // ==========================================
  async getCustomerStatement(
    orgId: string,
    customerId: string,
    dateFrom: string,
    dateTo: string
  ): Promise<CustomerStatementResult> {
    const { data, error } = await supabase.rpc('get_customer_statement', {
      p_org_id: orgId,
      p_customer_id: customerId,
      p_date_from: dateFrom,
      p_date_to: dateTo
    });

    if (error) throw error;
    return data as CustomerStatementResult;
  },

  // ==========================================
  // 4. VENDOR STATEMENT (كشف حساب مورد)
  // ==========================================
  async getVendorStatement(
    orgId: string,
    vendorId: string,
    dateFrom: string,
    dateTo: string
  ): Promise<VendorStatementResult> {
    const { data, error } = await supabase.rpc('get_vendor_statement', {
      p_org_id: orgId,
      p_vendor_id: vendorId,
      p_date_from: dateFrom,
      p_date_to: dateTo
    });

    if (error) throw error;
    return data as VendorStatementResult;
  },

// ==========================================
  // 5. CURRENT INVENTORY VALUATION (تقرير المخزون)
  // ==========================================
  async getInventoryReport(orgId: string): Promise<InventoryReportRow[]> {
    const { data, error } = await supabase.rpc('get_inventory_report', {
      p_org_id: orgId
    });

    if (error) throw error;
    return (data || []) as InventoryReportRow[];
  },

  // ==========================================
  // 6. ADVANCED INCOME STATEMENT (قائمة الدخل المتقدمة)
  // ==========================================
  async getIncomeStatementAdvanced(
    orgId: string,
    dateFrom: string,
    dateTo: string,
    excludeClosingEntries: boolean = true
  ): Promise<AdvancedIncomeStatementResult> {
    const { data, error } = await supabase.rpc('get_income_statement_advanced', {
      p_org_id: orgId,
      p_date_from: dateFrom,
      p_date_to: dateTo,
      p_exclude_closing_entries: excludeClosingEntries
    });

    if (error) throw error;
    return data as AdvancedIncomeStatementResult;
  },

  // ==========================================
  // 7. VAT TAX REPORT (التقرير الضريبي المخصص)
  // ==========================================
  async getTaxReport(
    orgId: string,
    dateFrom: string,
    dateTo: string
  ): Promise<TaxReportResult> {
    const { data, error } = await supabase.rpc('get_tax_report', {
      p_org_id: orgId,
      p_date_from: dateFrom,
      p_date_to: dateTo
    });

    if (error) throw error;
    return data as TaxReportResult;
  },

  // ==========================================
  // 8. ADVANCED TRIAL BALANCE (ميزان المراجعة المتقدم)
  // ==========================================
  async getTrialBalanceAdvanced(
    orgId: string,
    dateFrom: string,
    dateTo: string,
    includeZeroAccounts: boolean = false,
    includeParentAccounts: boolean = true,
    excludeClosingEntries: boolean = true
  ): Promise<TrialBalanceResult> {
    const { data, error } = await supabase.rpc('get_trial_balance_advanced', {
      p_org_id: orgId,
      p_date_from: dateFrom,
      p_date_to: dateTo,
      p_include_zero_accounts: includeZeroAccounts,
      p_include_parent_accounts: includeParentAccounts,
      p_exclude_closing_entries: excludeClosingEntries
    });

    if (error) throw error;
    return data as TrialBalanceResult;
  },

  // ==========================================
  // 9. ADVANCED LEDGER REPORT (دفتر الأستاذ المتقدم)
  // ==========================================
  async getLedgerReportAdvanced(
    orgId: string,
    accountId: string,
    dateFrom: string,
    dateTo: string,
    excludeClosingEntries: boolean = false
  ): Promise<LedgerReportResult> {
    const { data, error } = await supabase.rpc('get_ledger_report_advanced', {
      p_org_id: orgId,
      p_account_id: accountId,
      p_date_from: dateFrom,
      p_date_to: dateTo,
      p_exclude_closing_entries: excludeClosingEntries
    });

    if (error) throw error;
    return data as LedgerReportResult;
  },

  // ==========================================
  // 10. CUSTOMER AGING REPORT (أعمار ذمم العملاء)
  // ==========================================
  async getCustomerAgingReport(
    orgId: string,
    asOfDate: string
  ): Promise<CustomerAgingRow[]> {
    const { data, error } = await supabase.rpc('get_customer_aging_report', {
      p_organization_id: orgId,
      p_as_of_date: asOfDate
    });

    if (error) throw error;
    return (data || []) as CustomerAgingRow[];
  },

  // ==========================================
  // 11. VENDOR AGING REPORT (أعمار ذمم الموردين)
  // ==========================================
  async getVendorAgingReport(
    orgId: string,
    asOfDate: string
  ): Promise<VendorAgingRow[]> {
    const { data, error } = await supabase.rpc('get_vendor_aging_report', {
      p_organization_id: orgId,
      p_as_of_date: asOfDate
    });

    if (error) throw error;
    return (data || []) as VendorAgingRow[];
  }
};

export interface TrialBalanceAccount {
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

export interface TrialBalanceTotals {
  opening_debit: number;
  opening_credit: number;
  period_debit: number;
  period_credit: number;
  closing_debit: number;
  closing_credit: number;
  is_balanced: boolean;
  difference: number;
}

export interface TrialBalanceResult {
  date_from: string;
  date_to: string;
  include_zero_accounts: boolean;
  include_parent_accounts: boolean;
  exclude_closing_entries: boolean;
  totals: TrialBalanceTotals;
  accounts: TrialBalanceAccount[];
}

export interface LedgerAccountInfo {
  id: string;
  code: string;
  name_ar: string;
  name_en: string | null;
  classification: string;
  nature: 'debit' | 'credit';
}

export interface LedgerEntryRow {
  entry_id: string;
  entry_date: string;
  reference: string;
  description: string;
  debit: number;
  credit: number;
  source_type: string;
  source_id: string | null;
  is_closing_entry: boolean;
  running_balance: number;
}

export interface LedgerReportResult {
  account: LedgerAccountInfo;
  date_from: string;
  date_to: string;
  exclude_closing_entries: boolean;
  opening_balance: number;
  total_debit: number;
  total_credit: number;
  closing_balance: number;
  entries: LedgerEntryRow[];
}

export interface AdvancedIncomeStatementAccount {
  account_id: string;
  code: string;
  name_ar: string;
  name_en: string | null;
  amount: number;
}

export interface AdvancedIncomeStatementResult {
  date_from: string;
  date_to: string;
  exclude_closing_entries: boolean;
  total_revenue: number;
  total_cogs: number;
  gross_profit: number;
  total_operating_expenses: number;
  total_expenses: number;
  net_income: number;
  revenue_accounts: AdvancedIncomeStatementAccount[];
  cogs_accounts: AdvancedIncomeStatementAccount[];
  expense_accounts: AdvancedIncomeStatementAccount[];
}

export interface TaxMovement {
  date: string;
  reference: string | null;
  description: string;
  debit: number;
  credit: number;
  net_amount: number;
}

export interface TaxReportResult {
  date_from: string;
  date_to: string;
  output_tax_account_id: string | null;
  input_tax_account_id: string | null;
  total_output_tax: number;
  total_input_tax: number;
  net_tax_due: number;
  output_tax_movements: TaxMovement[];
  input_tax_movements: TaxMovement[];
}

export interface CustomerAgingRow {
  customer_id: string;
  customer_name: string;
  customer_code: string;
  total_due: number;
  not_due: number;
  bucket_0_30: number;
  bucket_31_60: number;
  bucket_61_90: number;
  bucket_over_90: number;
  last_invoice_number: string | null;
  last_invoice_date: string | null;
  last_receipt_number: string | null;
  last_receipt_date: string | null;
  currency_code: string;
}

export interface VendorAgingRow {
  vendor_id: string;
  vendor_name: string;
  vendor_code: string;
  total_due: number;
  not_due: number;
  bucket_0_30: number;
  bucket_31_60: number;
  bucket_61_90: number;
  bucket_over_90: number;
  last_bill_number: string | null;
  last_bill_date: string | null;
  last_payment_number: string | null;
  last_payment_date: string | null;
  currency_code: string;
}

