import { supabase } from './supabase';

export interface OpeningBalanceBatch {
  id: string;
  status: 'draft' | 'posted';
  opening_date: string;
  currency_code: string;
  total_debit: number;
  total_credit: number;
  difference: number;
  notes: string;
}

export interface OpeningGLRecord {
  id?: string;
  account_id: string;
  debit: number;
  credit: number;
  notes?: string;
}

export interface OpeningCustomerRecord {
  id?: string;
  customer_id: string;
  debit: number;
  credit: number;
  reference?: string;
  notes?: string;
}

export interface OpeningVendorRecord {
  id?: string;
  vendor_id: string;
  debit: number;
  credit: number;
  reference?: string;
  notes?: string;
}

export interface OpeningBankRecord {
  id?: string;
  cash_bank_account_id: string;
  debit: number;
  credit: number;
  notes?: string;
}

export interface OpeningInventoryRecord {
  id?: string;
  item_id: string;
  quantity: number;
  unit_cost: number;
  total_cost?: number;
}

export interface OpeningBalancesWizardData {
  batch: OpeningBalanceBatch;
  gl_lines: OpeningGLRecord[];
  customer_lines: OpeningCustomerRecord[];
  vendor_lines: OpeningVendorRecord[];
  bank_lines: OpeningBankRecord[];
  inventory_lines: OpeningInventoryRecord[];
}

export const openingBalancesService = {
  /**
   * Retrieves the current opening balance batch (loads existing or creates a draft)
   */
  async getOpeningBalancesWizardData(orgId: string): Promise<OpeningBalancesWizardData> {
    const { data, error } = await supabase.rpc('get_or_create_opening_balance_batch', {
      p_org_id: orgId
    });

    if (error) throw error;
    return data as OpeningBalancesWizardData;
  },

  /**
   * Checks if the organization has any financial transactions
   */
  async checkOrgHasTransactions(orgId: string): Promise<boolean> {
    const { data, error } = await supabase.rpc('check_org_has_transactions', {
      p_org_id: orgId
    });

    if (error) throw error;
    return !!data;
  },

  /**
   * Saves the opening balances draft wizard
   */
  async saveOpeningBalancesWizard(
    orgId: string,
    batchId: string,
    openingDate: string,
    notes: string,
    glLines: OpeningGLRecord[],
    customerLines: OpeningCustomerRecord[],
    vendorLines: OpeningVendorRecord[],
    bankLines: OpeningBankRecord[],
    inventoryLines: OpeningInventoryRecord[]
  ): Promise<void> {
    const { error } = await supabase.rpc('save_opening_balances_wizard', {
      p_org_id: orgId,
      p_batch_id: batchId,
      p_opening_date: openingDate,
      p_notes: notes,
      p_gl_lines: glLines,
      p_customer_lines: customerLines,
      p_vendor_lines: vendorLines,
      p_bank_lines: bankLines,
      p_inventory_lines: inventoryLines
    });

    if (error) throw error;
  },

  /**
   * Posts the opening balances batch (permanently locks and creates balanced journal entry)
   */
  async postOpeningBalancesWizard(orgId: string, batchId: string): Promise<string> {
    const { data, error } = await supabase.rpc('post_opening_balances_wizard', {
      p_org_id: orgId,
      p_batch_id: batchId
    });

    if (error) throw error;
    return data as string; // returns journal_entry_id
  }
};
