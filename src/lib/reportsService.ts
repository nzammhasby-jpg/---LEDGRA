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
  }
};
