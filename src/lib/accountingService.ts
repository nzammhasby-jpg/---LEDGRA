import { supabase } from './supabase';
import { 
  FiscalYear, 
  FiscalPeriod, 
  Account, 
  AccountingSettings, 
  AccountClassification, 
  AccountNature 
} from '../types';

// Helper to check if year dates overlap with existing years
async function hasFiscalYearOverlap(
  orgId: string, 
  startDate: string, 
  endDate: string, 
  excludeYearId?: string
): Promise<boolean> {
  let query = supabase
    .from('fiscal_years')
    .select('id, start_date, end_date')
    .eq('organization_id', orgId);
    
  if (excludeYearId) {
    query = query.neq('id', excludeYearId);
  }
  
  const { data, error } = await query;
  if (error || !data) return false;
  
  const start = new Date(startDate);
  const end = new Date(endDate);
  
  return data.some(y => {
    const yStart = new Date(y.start_date);
    const yEnd = new Date(y.end_date);
    // Overlap condition
    return (start <= yEnd && end >= yStart);
  });
}

// Helper to check if period dates overlap
function hasPeriodOverlap(periods: { start_date: string; end_date: string }[]): boolean {
  for (let i = 0; i < periods.length; i++) {
    const s1 = new Date(periods[i].start_date);
    const e1 = new Date(periods[i].end_date);
    for (let j = i + 1; j < periods.length; j++) {
      const s2 = new Date(periods[j].start_date);
      const e2 = new Date(periods[j].end_date);
      if (s1 <= e2 && e1 >= s2) return true;
    }
  }
  return false;
}

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
    yearData: { name: string; start_date: string; end_date: string; is_current: boolean },
    userId?: string
  ): Promise<FiscalYear> {
    const { data: yearId, error: rpcError } = await supabase.rpc('create_fiscal_year', {
      p_org_id: orgId,
      p_name: yearData.name,
      p_start_date: yearData.start_date,
      p_end_date: yearData.end_date,
      p_is_current: yearData.is_current,
      p_user_id: userId || null
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

  async updateFiscalYearStatus(orgId: string, yearId: string, status: 'open' | 'closed' | 'draft'): Promise<void> {
    const { error } = await supabase
      .from('fiscal_years')
      .update({ status })
      .eq('id', yearId)
      .eq('organization_id', orgId);
      
    if (error) throw error;
  },

  async updateFiscalPeriodStatus(orgId: string, periodId: string, status: 'open' | 'closed'): Promise<void> {
    const { error } = await supabase
      .from('fiscal_periods')
      .update({ status })
      .eq('id', periodId)
      .eq('organization_id', orgId);

    if (error) throw error;
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
    // 1. Check code uniqueness
    const { data: existingCode } = await supabase
      .from('accounts')
      .select('id')
      .eq('organization_id', orgId)
      .eq('code', accountData.code)
      .maybeSingle();

    if (existingCode) {
      throw new Error(`رمز الحساب "${accountData.code}" مكرر ومسجل بالفعل لحساب آخر.`);
    }

    // 2. Perform parent check to make sure it's valid
    if (accountData.parent_id) {
      const { data: parentAccount, error: parentError } = await supabase
        .from('accounts')
        .select('*')
        .eq('id', accountData.parent_id)
        .eq('organization_id', orgId)
        .single();
        
      if (parentError || !parentAccount) {
        throw new Error('الحساب الأب المحدد غير موجود أو ينتمي لمنشأة أخرى.');
      }

      // If the parent has direct postings enabled, set it to false since it now acts as an aggregator (non-leaf node)
      if (parentAccount.allow_direct_posting) {
        await supabase
          .from('accounts')
          .update({ allow_direct_posting: false })
          .eq('id', parentAccount.id);
      }
    }

    // 3. Save new account
    const { data: newAccount, error: insertError } = await supabase
      .from('accounts')
      .insert({
        ...accountData,
        organization_id: orgId
      })
      .select()
      .single();

    if (insertError) throw insertError;
    if (!newAccount) throw new Error('فشلت عملية حفظ الحساب في خادم البيانات.');
    
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

    // Check system account guidelines
    if (original.is_system) {
      // System accounts classifications & natural tendencies cannot be modified!
      if (updates.classification && updates.classification !== original.classification) {
        throw new Error('لا يمكن تعديل التصنيف الرئيسي لحساب نظامي محمي.');
      }
      if (updates.nature && updates.nature !== original.nature) {
        throw new Error('لا يمكن تعديل طبيعة الحساب (مدين/دائن) لحساب نظامي محمي.');
      }
      if (updates.code && updates.code !== original.code) {
        throw new Error('لا يمكن تغيير الرمز التعريفي لحساب نظامي محمي.');
      }
    }

    // 3. Check for circular depth check in parent hierarchies if changing parent
    if (updates.parent_id && updates.parent_id !== original.parent_id) {
      // Loop check
      let currentParentId: string | null = updates.parent_id;
      while (currentParentId) {
        if (currentParentId === accountId) {
          throw new Error('لا يمكن ربط الحساب بحساب ابن فرعي من مستواه لمنع الدورة التكرارية اللانهائية.');
        }
        const { data: nextParent } = await supabase
          .from('accounts')
          .select('parent_id')
          .eq('id', currentParentId)
          .maybeSingle();
        currentParentId = nextParent ? nextParent.parent_id : null;
      }

      // Convert new parent's allow_direct_posting to false
      await supabase
        .from('accounts')
        .update({ allow_direct_posting: false })
        .eq('id', updates.parent_id);
    }

    const { data: updatedAccount, error: updateError } = await supabase
      .from('accounts')
      .update(updates)
      .eq('id', accountId)
      .eq('organization_id', orgId)
      .select()
      .single();

    if (updateError) throw updateError;
    if (!updatedAccount) throw new Error('فشلت خطوة تحديث الحساب المحاسبي.');

    return updatedAccount;
  },

  async deleteAccount(orgId: string, accountId: string): Promise<void> {
    // 1. Fetch details
    const { data: act, error: selectErr } = await supabase
      .from('accounts')
      .select('*')
      .eq('id', accountId)
      .eq('organization_id', orgId)
      .single();

    if (selectErr || !act) {
      throw new Error('الحساب المطلوب حذفه غير موجود أو غير مرخص للوصول.');
    }

    // 2. Prevent deleting system accounts
    if (act.is_system) {
      throw new Error('يمنع حذف الحسابات النظامية المحمية نظراً لاعتماد وظائف الفوترة والضريبة والقيود عليها بشكل كامل.');
    }

    // 3. Prevent deleting if it contains child accounts
    const { data: children, error: childErr } = await supabase
      .from('accounts')
      .select('id')
      .eq('organization_id', orgId)
      .eq('parent_id', accountId)
      .limit(1);

    if (childErr) throw childErr;
    if (children && children.length > 0) {
      throw new Error('لا يمكن حذف حساب تجميعي يحتوي على حسابات فرعية دونه. يرجى نقل أو حذف الحسابات التابعة له أولاً.');
    }

    // 4. Ready to delete
    const { error: deleteErr } = await supabase
      .from('accounts')
      .delete()
      .eq('id', accountId)
      .eq('organization_id', orgId);

    if (deleteErr) throw deleteErr;
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
    // Clean keys not editable or metadata
    const cleanSettings = { ...settings };
    delete cleanSettings.id;
    delete cleanSettings.organization_id;
    delete cleanSettings.created_at;
    delete cleanSettings.updated_at;

    // Verify all specified account pointers are active leaf nodes
    const checkPromises = Object.entries(cleanSettings)
      .filter(([_, value]) => value !== null && value !== undefined)
      .map(async ([field, value]) => {
        const { data: targetAccount } = await supabase
          .from('accounts')
          .select('name_ar, is_active, allow_direct_posting')
          .eq('id', value)
          .eq('organization_id', orgId)
          .single();

        if (!targetAccount) {
          throw new Error(`الحساب المختار لا ينتمي لهذه المنشأة.`);
        }
         if (!targetAccount.is_active) {
          throw new Error(`الحساب "${targetAccount.name_ar}" تم إيقاف نشاطه ولا يمكن ربطه كحساب افتراضي.`);
        }
        if (!targetAccount.allow_direct_posting) {
          throw new Error(`الحساب "${targetAccount.name_ar}" هو حساب رتبة تجميعية (أب)، ولا يمكن الترحيل المباشر أو الربط الافتراضي لعمليات الفوترة عليه.`);
        }
      });

    await Promise.all(checkPromises);

    const { data, error } = await supabase
      .from('accounting_settings')
      .update(cleanSettings)
      .eq('organization_id', orgId)
      .select()
      .single();

    if (error) throw error;
    return data;
  },


  // ==========================================
  // GENERATE DEFAULT COA (ONE-TIME INITIALIZER)
  // ==========================================
  async generateDefaultChartOfAccounts(orgId: string): Promise<void> {
    const { error } = await supabase.rpc('seed_default_chart_of_accounts', {
      p_org_id: orgId
    });

    if (error) throw error;
  }
};
