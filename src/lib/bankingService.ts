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
    try {
      const { data, error } = await supabase.rpc('create_cash_bank_account', {
        p_organization_id: input.organization_id || null,
        p_account_id: input.account_id || null,
        p_type: input.type || null,
        p_name: input.name || null,
        p_bank_name: input.bank_name || null,
        p_iban: input.iban || null,
        p_account_number: input.account_number || null,
        p_opening_balance: typeof input.opening_balance === 'number' ? input.opening_balance : 0,
        p_is_default: !!input.is_default,
        p_notes: input.notes || null
      });

      if (error) {
        console.error('Supabase RPC create_cash_bank_account failed:', error);
        
        const msg = error.message || '';
        
        if (msg.includes('الحساب المحدد لا ينتمي لهذه المنشأة')) {
          throw new Error('الحساب المحدد لا ينتمي لهذه المنشأة.');
        } else if (msg.includes('يجب أن يكون الحساب المختار من الأصول')) {
          throw new Error('يجب أن يكون الحساب المختار من الأصول (Assets).');
        } else if (msg.includes('يجب اختيار حساب يقبل الترحيل المباشر')) {
          throw new Error('يجب اختيار حساب يقبل الترحيل المباشر (Direct Posting).');
        } else if (msg.includes('الحساب المختار غير نشط')) {
          throw new Error('الحساب المختار غير نشط.');
        } else if (msg.includes('نوع الحساب غير صالح')) {
          throw new Error('نوع الحساب غير صالح. يجب أن يكون cash أو bank.');
        } else if (msg.includes('عملة المنشأة غير مضبوطة')) {
          throw new Error('عملة المنشأة غير مضبوطة. يرجى مراجعة إعدادات المنشأة.');
        } else if (msg.includes('عملة حساب الصندوق أو البنك يجب أن تطابق')) {
          throw new Error('عملة حساب الصندوق أو البنك يجب أن تطابق عملة المنشأة.');
        } else if (msg.includes('غير مصرح') || msg.includes('Permission denied') || error.code === '42501') {
          throw new Error('غير مصرح: هذه العملية متاحة لمالك أو مدير المنشأة فقط.');
        } else {
          const isArabic = /[\u0600-\u06FF]/.test(msg);
          if (isArabic) {
            throw new Error(msg);
          }
          throw new Error('فشلت عملية إنشاء الحساب المالي. يرجى مراجعة البيانات المدخلة.');
        }
      }

      if (!data) {
        throw new Error('فشلت عملية إنشاء الحساب المالي ولم يتم إرجاع رقم معرّف.');
      }

      return data;
    } catch (err: any) {
      console.error('Error in createCashBankAccount service wrapper:', err);
      const errMsg = err?.message || '';
      if (err instanceof TypeError || errMsg.includes('Failed to fetch') || errMsg.includes('network') || errMsg.includes('fetch')) {
        throw new Error('تعذر الاتصال بالخادم. تحقق من الاتصال أو أعد تحميل الصفحة ثم حاول مرة أخرى.');
      }
      throw err;
    }
  },

  /**
   * Updates an existing cash or bank account.
   */
  async updateCashBankAccount(input: UpdateCashBankAccountInput): Promise<void> {
    try {
      const { error } = await supabase.rpc('update_cash_bank_account', {
        p_id: input.id || null,
        p_name: input.name || null,
        p_bank_name: input.bank_name || null,
        p_iban: input.iban || null,
        p_account_number: input.account_number || null,
        p_is_default: !!input.is_default,
        p_notes: input.notes || null,
        p_is_active: input.is_active !== undefined ? !!input.is_active : true
      });

      if (error) {
        console.error('Supabase RPC update_cash_bank_account failed:', error);
        const msg = error.message || '';
        const isArabic = /[\u0600-\u06FF]/.test(msg);
        if (isArabic) {
          throw new Error(msg);
        }
        if (msg.includes('غير مصرح') || msg.includes('Permission denied') || error.code === '42501') {
          throw new Error('غير مصرح: هذه العملية متاحة لمالك أو مدير المنشأة فقط.');
        }
        throw new Error('فشلت عملية تحديث الحساب المالي.');
      }
    } catch (err: any) {
      console.error('Error in updateCashBankAccount service wrapper:', err);
      const errMsg = err?.message || '';
      if (err instanceof TypeError || errMsg.includes('Failed to fetch') || errMsg.includes('network') || errMsg.includes('fetch')) {
        throw new Error('تعذر الاتصال بالخادم. تحقق من الاتصال أو أعد تحميل الصفحة ثم حاول مرة أخرى.');
      }
      throw err;
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

