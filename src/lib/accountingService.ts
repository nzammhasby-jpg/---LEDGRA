import { supabase } from './supabase';
import { 
  FiscalYear, 
  FiscalPeriod, 
  Account, 
  AccountingSettings 
} from '../types';

export const accountingService = {
  // ==========================================
  // FISCAL YEARS & PERIODS
  // ==========================================
  async getFiscalYears(orgId: string): Promise<FiscalYear[]> {
    const { data, error } = await supabase
      .from('fiscal_years')
      .select('*')
      .eq('organization_id', orgId)
      .order('start_date', { ascending: false });
      
    if (error) throw error;
    return data || [];
  },

  async getFiscalPeriods(yearId: string): Promise<FiscalPeriod[]> {
    const { data, error } = await supabase
      .from('fiscal_periods')
      .select('*')
      .eq('fiscal_year_id', yearId)
      .order('period_num', { ascending: true });
      
    if (error) throw error;
    return data || [];
  },

  async createFiscalYear(
    orgId: string, 
    yearData: { name: string; start_date: string; end_date: string; is_current: boolean }
  ): Promise<FiscalYear> {
    const { data: yearId, error: rpcError } = await supabase.rpc('create_fiscal_year', {
      p_org_id: orgId,
      p_name: yearData.name,
      p_start_date: yearData.start_date,
      p_end_date: yearData.end_date,
      p_is_current: yearData.is_current
    });

    if (rpcError) throw rpcError;
    if (!yearId) throw new Error('فشلت عملية إنشاء السنة المالية في خادم البيانات.');

    // Retrieve full record
    const { data: newYear, error: fetchError } = await supabase
      .from('fiscal_years')
      .select('*')
      .eq('id', yearId)
      .single();

    if (fetchError || !newYear) {
      throw new Error('فشل استرداد بيانات السنة المالية المنشأة حديثاً من قاعدة البيانات.');
    }

    return newYear;
  },

  async setCurrentFiscalYear(orgId: string, yearId: string): Promise<void> {
    const { error } = await supabase.rpc('set_current_fiscal_year', {
      p_org_id: orgId,
      p_year_id: yearId
    });
    if (error) throw error;
  },

  async closeFiscalPeriod(orgId: string, periodId: string): Promise<void> {
    const { error } = await supabase.rpc('close_fiscal_period', {
      p_org_id: orgId,
      p_period_id: periodId
    });
    if (error) throw error;
  },

  async reopenFiscalPeriod(orgId: string, periodId: string): Promise<void> {
    const { error } = await supabase.rpc('reopen_fiscal_period', {
      p_org_id: orgId,
      p_period_id: periodId
    });
    if (error) throw error;
  },

  async closeFiscalYear(orgId: string, fiscalYearId: string, notes?: string): Promise<any> {
    const { data, error } = await supabase.rpc('close_fiscal_year', {
      p_org_id: orgId,
      p_fiscal_year_id: fiscalYearId,
      p_close_notes: notes || null
    });
    if (error) throw error;
    return data;
  },

  async reopenFiscalYear(orgId: string, fiscalYearId: string, reason: string): Promise<any> {
    const { data, error } = await supabase.rpc('reopen_fiscal_year', {
      p_org_id: orgId,
      p_fiscal_year_id: fiscalYearId,
      p_reason: reason
    });
    if (error) throw error;
    return data;
  },

  async getFiscalYearClosingSummary(orgId: string, fiscalYearId: string): Promise<any> {
    const { data, error } = await supabase.rpc('get_fiscal_year_closing_summary', {
      p_org_id: orgId,
      p_fiscal_year_id: fiscalYearId
    });
    if (error) throw error;
    return data;
  },




  // ==========================================
  // ACCOUNTS & CHART OF ACCOUNTS (TREE)
  // ==========================================
  async getAccounts(orgId: string): Promise<Account[]> {
    const { data, error } = await supabase
      .from('accounts')
      .select('*')
      .eq('organization_id', orgId)
      .order('code', { ascending: true });
      
    if (error) throw error;
    return data || [];
  },

  async createAccount(
    orgId: string, 
    accountData: Omit<Account, 'id' | 'created_at' | 'updated_at' | 'organization_id'>
  ): Promise<Account> {
    const { data: accountId, error: rpcError } = await supabase.rpc('create_account', {
      p_org_id: orgId,
      p_code: accountData.code,
      p_name_ar: accountData.name_ar,
      p_name_en: accountData.name_en || null,
      p_classification: accountData.classification,
      p_nature: accountData.nature,
      p_parent_id: accountData.parent_id || null,
      p_description: accountData.description || null,
      p_is_active: accountData.is_active !== undefined ? accountData.is_active : true,
      p_allow_direct_posting: accountData.allow_direct_posting !== undefined ? accountData.allow_direct_posting : true
    });

    if (rpcError) throw rpcError;
    if (!accountId) throw new Error('فشلت عملية حفظ الحساب في خادم البيانات.');

    // Retrieve the full created account
    const { data: newAccount, error: fetchError } = await supabase
      .from('accounts')
      .select('*')
      .eq('id', accountId)
      .eq('organization_id', orgId)
      .single();

    if (fetchError || !newAccount) {
      throw new Error('فشل استرداد الحساب المحفوظ حديثًا من قاعدة البيانات.');
    }

    return newAccount;
  },

  async updateAccount(
    orgId: string, 
    accountId: string, 
    updates: Partial<Omit<Account, 'id' | 'created_at' | 'updated_at' | 'organization_id'>>
  ): Promise<Account> {
    // 1. Prevent circular loop parent association
    if (updates.parent_id && updates.parent_id === accountId) {
      throw new Error('لا يمكن اختيار الحساب نفسه كحساب أب.');
    }

    // 2. Fetch original state
    const { data: original, error: fetchErr } = await supabase
      .from('accounts')
      .select('*')
      .eq('id', accountId)
      .eq('organization_id', orgId)
      .single();
      
    if (fetchErr || !original) {
      throw new Error('الحساب المحاد تعديله غير موجود أو يفتقر للصلاحية.');
    }

    // 3. Merge original with updates
    const merged = { ...original, ...updates };

    const { error: rpcError } = await supabase.rpc('update_account', {
      p_org_id: orgId,
      p_account_id: accountId,
      p_code: merged.code,
      p_name_ar: merged.name_ar,
      p_name_en: merged.name_en || null,
      p_classification: merged.classification,
      p_nature: merged.nature,
      p_parent_id: merged.parent_id || null,
      p_description: merged.description || null,
      p_is_active: merged.is_active,
      p_allow_direct_posting: merged.allow_direct_posting
    });

    if (rpcError) throw rpcError;

    // Retrieve again to return refreshed entity
    const { data: updatedAccount, error: fetchError } = await supabase
      .from('accounts')
      .select('*')
      .eq('id', accountId)
      .eq('organization_id', orgId)
      .single();

    if (fetchError || !updatedAccount) {
      throw new Error('فشلت خطوة استعادة بيانات الحساب المعدل.');
    }

    return updatedAccount;
  },

  async updateAccountBalanceSheetSection(
    orgId: string,
    accountId: string,
    section: 'current_asset' | 'non_current_asset' | 'current_liability' | 'non_current_liability' | 'equity' | null
  ): Promise<Account> {
    const { data, error } = await supabase
      .from('accounts')
      .update({ balance_sheet_section: section })
      .eq('id', accountId)
      .eq('organization_id', orgId)
      .select('*')
      .single();

    if (error) throw error;
    return data;
  },

  async deleteAccount(orgId: string, accountId: string): Promise<void> {
    const { error } = await supabase.rpc('delete_account', {
      p_org_id: orgId,
      p_account_id: accountId
    });

    if (error) throw error;
  },


  // ==========================================
  // ACCOUNTING SETTINGS (CORE ACCOUNT POINTERS)
  // ==========================================
  async getAccountingSettings(orgId: string): Promise<AccountingSettings> {
    const { data, error } = await supabase
      .from('accounting_settings')
      .select('*')
      .eq('organization_id', orgId)
      .maybeSingle();

    if (error) throw error;
    return data;
  },

  async updateAccountingSettings(orgId: string, settings: Partial<AccountingSettings>): Promise<AccountingSettings> {
    // Retrieve existing first to merge updates
    const existing = await this.getAccountingSettings(orgId);

    const merged = { ...existing, ...settings };

    const { error: rpcError } = await supabase.rpc('update_accounting_settings', {
      p_org_id: orgId,
      p_receivables: merged.default_receivables_account_id || null,
      p_payables: merged.default_payables_account_id || null,
      p_cash: merged.default_cash_account_id || null,
      p_bank: merged.default_bank_account_id || null,
      p_sales: merged.default_sales_account_id || null,
      p_service_sales: merged.default_service_sales_account_id || null,
      p_tax_output: merged.default_tax_output_account_id || null,
      p_tax_input: merged.default_tax_input_account_id || null,
      p_cogs: merged.default_cogs_account_id || null,
      p_inventory: merged.default_inventory_account_id || null,
      p_retained: merged.default_retained_earnings_account_id || null
    });

    if (rpcError) throw rpcError;

    // Retrieve fresh
    const { data, error: fetchError } = await supabase
      .from('accounting_settings')
      .select('*')
      .eq('organization_id', orgId)
      .single();

    if (fetchError) throw fetchError;
    return data;
  },


  // ==========================================
  // GENERATE DEFAULT COA (ONE-TIME INITIALIZER)
  // ==========================================
  async generateDefaultChartOfAccounts(orgId: string): Promise<string> {
    const { data, error } = await supabase.rpc('seed_default_chart_of_accounts', {
      p_org_id: orgId
    });

    if (error) throw error;
    return data;
  },

  // ==========================================
  // INDUSTRY COA TEMPLATES (COA PHASE 2A)
  // ==========================================
  async getAvailableCoaTemplates(): Promise<any[]> {
    const { data, error } = await supabase.rpc('get_available_coa_templates');
    if (error) throw error;
    return data || [];
  },

  async seedIndustryChartOfAccounts(orgId: string, industryType: string = 'general_trading'): Promise<{ status: string; inserted_accounts?: number; industry_type?: string }> {
    const { data, error } = await supabase.rpc('seed_industry_chart_of_accounts', {
      p_organization_id: orgId,
      p_industry_type: industryType
    });

    if (error) throw error;
    return data;
  },

  async ensureDefaultChartOfAccounts(orgId: string, industryType: string = 'general_trading'): Promise<{ status: string; inserted_accounts?: number }> {
    const { data, error } = await supabase.rpc('ensure_default_chart_of_accounts', {
      p_organization_id: orgId,
      p_industry_type: industryType
    });

    if (error) throw error;
    return data;
  }
};
