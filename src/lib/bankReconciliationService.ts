import { supabase } from './supabase';
import { BankReconciliation, BankReconciliationLine } from '../types';

export const bankReconciliationService = {
  /**
   * List all bank reconciliations for an organization
   */
  async listBankReconciliations(organizationId: string): Promise<BankReconciliation[]> {
    const { data, error } = await supabase.rpc('list_bank_reconciliations', {
      p_organization_id: organizationId
    });

    if (error) {
      console.error('Error fetching bank reconciliations:', error);
      throw error;
    }

    return data || [];
  },

  /**
   * Get details of a single bank reconciliation
   */
  async getBankReconciliation(reconciliationId: string): Promise<BankReconciliation> {
    const { data, error } = await supabase.rpc('get_bank_reconciliation', {
      p_reconciliation_id: reconciliationId
    });

    if (error) {
      console.error('Error fetching bank reconciliation details:', error);
      throw error;
    }

    if (!data || data.length === 0) {
      throw new Error('جلسة المطابقة البنكية المحددة غير موجودة.');
    }

    return data[0];
  },

  /**
   * List lines of a single bank reconciliation
   */
  async listBankReconciliationLines(reconciliationId: string): Promise<BankReconciliationLine[]> {
    const { data, error } = await supabase.rpc('list_bank_reconciliation_lines', {
      p_reconciliation_id: reconciliationId
    });

    if (error) {
      console.error('Error fetching bank reconciliation lines:', error);
      throw error;
    }

    return data || [];
  },

  /**
   * Create a new draft bank reconciliation
   */
  async createBankReconciliation(input: {
    organization_id: string;
    cash_bank_account_id: string;
    reconciliation_date: string;
    statement_balance: number;
    notes?: string | null;
  }): Promise<string> {
    const { data, error } = await supabase.rpc('create_bank_reconciliation', {
      p_organization_id: input.organization_id,
      p_cash_bank_account_id: input.cash_bank_account_id,
      p_reconciliation_date: input.reconciliation_date,
      p_statement_balance: input.statement_balance,
      p_notes: input.notes || null
    });

    if (error) {
      console.error('Error creating bank reconciliation:', error);
      throw error;
    }

    if (!data) {
      throw new Error('فشلت عملية إنشاء المطابقة ولم يتم إرجاع معرّف الجلسة.');
    }

    return data;
  },

  /**
   * Toggle is_matched status for a line
   */
  async toggleReconciliationLine(lineId: string, isMatched: boolean): Promise<void> {
    const { error } = await supabase.rpc('toggle_reconciliation_line', {
      p_line_id: lineId,
      p_is_matched: isMatched
    });

    if (error) {
      console.error('Error toggling reconciliation line:', error);
      throw error;
    }
  },

  /**
   * Complete a bank reconciliation (status goes to completed)
   */
  async completeBankReconciliation(reconciliationId: string): Promise<void> {
    const { error } = await supabase.rpc('complete_bank_reconciliation', {
      p_reconciliation_id: reconciliationId
    });

    if (error) {
      console.error('Error completing bank reconciliation:', error);
      throw error;
    }
  },

  /**
   * Cancel a bank reconciliation (status goes to cancelled)
   */
  async cancelBankReconciliation(reconciliationId: string, reason: string): Promise<void> {
    const { error } = await supabase.rpc('cancel_bank_reconciliation', {
      p_reconciliation_id: reconciliationId,
      p_reason: reason
    });

    if (error) {
      console.error('Error cancelling bank reconciliation:', error);
      throw error;
    }
  },

  /**
   * List all adjustments for a bank reconciliation
   */
  async listBankReconciliationAdjustments(reconciliationId: string): Promise<any[]> {
    const { data, error } = await supabase
      .from('bank_reconciliation_adjustments')
      .select(`
        *,
        accounts (
          code,
          name_ar,
          name_en
        )
      `)
      .eq('reconciliation_id', reconciliationId);

    if (error) {
      console.error('Error fetching bank reconciliation adjustments:', error);
      throw error;
    }

    return (data || []).map(item => ({
      ...item,
      account_code: item.accounts?.code,
      account_name_ar: item.accounts?.name_ar,
      account_name_en: item.accounts?.name_en
    }));
  },

  /**
   * Add a bank reconciliation adjustment
   */
  async addBankReconciliationAdjustment(input: {
    reconciliation_id: string;
    adjustment_type: string;
    description: string;
    account_id: string;
    debit_amount?: number;
    credit_amount?: number;
    notes?: string | null;
  }): Promise<string> {
    const { data, error } = await supabase.rpc('add_bank_reconciliation_adjustment', {
      p_reconciliation_id: input.reconciliation_id,
      p_adjustment_type: input.adjustment_type,
      p_description: input.description,
      p_account_id: input.account_id,
      p_debit_amount: input.debit_amount || 0,
      p_credit_amount: input.credit_amount || 0,
      p_notes: input.notes || null
    });

    if (error) {
      console.error('Error adding bank reconciliation adjustment:', error);
      throw error;
    }

    return data;
  },

  /**
   * Remove a bank reconciliation adjustment
   */
  async removeBankReconciliationAdjustment(adjustmentId: string): Promise<void> {
    const { error } = await supabase.rpc('remove_bank_reconciliation_adjustment', {
      p_adjustment_id: adjustmentId
    });

    if (error) {
      console.error('Error removing bank reconciliation adjustment:', error);
      throw error;
    }
  }
};
