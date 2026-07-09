import { supabase } from './supabase';
import { 
  CashBankAccount, 
  CreateCashBankAccountInput, 
  UpdateCashBankAccountInput,
  CashBankTransfer,
  CreateCashBankTransferInput
} from '../types';

export const bankingService = {
  /**
   * Retrieves all cash and bank accounts for a given organization.
   */
  async listCashBankAccounts(orgId: string): Promise<CashBankAccount[]> {
    const { data, error } = await supabase.rpc('list_cash_bank_accounts', {
      p_organization_id: orgId
    });

    if (error) {
      console.error('Error fetching cash & bank accounts:', error);
      throw error;
    }

    return data || [];
  },

  /**
   * Creates a new cash or bank account.
   * Returns the UUID of the newly created account.
   */
  async createCashBankAccount(input: CreateCashBankAccountInput): Promise<string> {
    const { data, error } = await supabase.rpc('create_cash_bank_account', {
      p_organization_id: input.organization_id,
      p_account_id: input.account_id,
      p_type: input.type,
      p_name: input.name,
      p_bank_name: input.bank_name || null,
      p_iban: input.iban || null,
      p_account_number: input.account_number || null,
      p_opening_balance: input.opening_balance || 0,
      p_is_default: input.is_default || false,
      p_notes: input.notes || null
    });

    if (error) {
      console.error('Error creating cash & bank account:', error);
      throw error;
    }

    if (!data) {
      throw new Error('فشلت عملية إنشاء الحساب المالي ولم يتم إرجاع رقم معرّف.');
    }

    return data;
  },

  /**
   * Updates an existing cash or bank account.
   */
  async updateCashBankAccount(input: UpdateCashBankAccountInput): Promise<void> {
    const { error } = await supabase.rpc('update_cash_bank_account', {
      p_id: input.id,
      p_name: input.name,
      p_bank_name: input.bank_name || null,
      p_iban: input.iban || null,
      p_account_number: input.account_number || null,
      p_is_default: input.is_default || false,
      p_notes: input.notes || null,
      p_is_active: input.is_active !== undefined ? input.is_active : true
    });

    if (error) {
      console.error('Error updating cash & bank account:', error);
      throw error;
    }
  },

  /**
   * Retrieves all cash & bank transfers for a given organization.
   */
  async listCashBankTransfers(
    orgId: string, 
    status?: string | null, 
    fromDate?: string | null, 
    toDate?: string | null
  ): Promise<CashBankTransfer[]> {
    const { data, error } = await supabase.rpc('list_cash_bank_transfers', {
      p_organization_id: orgId,
      p_status: status || null,
      p_from_date: fromDate || null,
      p_to_date: toDate || null
    });

    if (error) {
      console.error('Error fetching cash & bank transfers:', error);
      throw error;
    }

    return data || [];
  },

  /**
   * Creates a new draft cash/bank transfer.
   */
  async createCashBankTransfer(input: CreateCashBankTransferInput): Promise<string> {
    const { data, error } = await supabase.rpc('create_cash_bank_transfer', {
      p_organization_id: input.organization_id,
      p_transfer_date: input.transfer_date,
      p_from_cash_bank_account_id: input.from_cash_bank_account_id,
      p_to_cash_bank_account_id: input.to_cash_bank_account_id,
      p_amount: input.amount,
      p_description: input.description || null,
      p_reference_number: input.reference_number || null
    });

    if (error) {
      console.error('Error creating cash & bank transfer:', error);
      throw error;
    }

    if (!data) {
      throw new Error('فشلت عملية إنشاء التحويل الداخلي ولم يتم إرجاع رقم معرّف.');
    }

    return data;
  },

  /**
   * Approves a draft cash/bank transfer.
   */
  async approveCashBankTransfer(transferId: string): Promise<void> {
    const { error } = await supabase.rpc('approve_cash_bank_transfer', {
      p_transfer_id: transferId
    });

    if (error) {
      console.error('Error approving cash & bank transfer:', error);
      throw error;
    }
  },

  /**
   * Cancels an approved cash/bank transfer.
   */
  async cancelCashBankTransfer(transferId: string, cancelReason?: string | null): Promise<void> {
    const { error } = await supabase.rpc('cancel_cash_bank_transfer', {
      p_transfer_id: transferId,
      p_cancel_reason: cancelReason || null
    });

    if (error) {
      console.error('Error cancelling cash & bank transfer:', error);
      throw error;
    }
  }
};

