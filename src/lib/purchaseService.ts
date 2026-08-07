import { supabase } from './supabase';
import { 
  PurchaseBill, 
  PurchaseBillStatus, 
  PaymentStatus, 
  Payment, 
  PaymentMethod,
  PaymentStatusType,
  PurchaseDebitNote,
  InvoicePaymentMethod,
  PaymentDetails
} from '../types';

export interface CreatePurchaseBillInput {
  vendor_id: string;
  vendor_invoice_number?: string;
  bill_date: string;
  due_date: string;
  notes?: string;
  prices_include_tax?: boolean;
  payment_method?: InvoicePaymentMethod;
  payment_reference?: string;
  payment_notes?: string;
  payment_details?: PaymentDetails;
  lines: Array<{
    item_id?: string;
    description?: string;
    quantity: number;
    unit_cost: number;
    discount_amount?: number;
    tax_rate?: number;
    expense_account_id?: string;
    inventory_account_id?: string;
  }>;
}

export interface CreatePaymentInput {
  vendor_id: string;
  payment_date: string;
  amount: number;
  payment_method: PaymentMethod;
  cash_account_id?: string;
  bank_account_id?: string;
  cash_bank_account_id?: string;
  reference?: string;
  notes?: string;
  allocations: Array<{
    purchase_bill_id: string;
    allocated_amount: number;
  }>;
}

export const purchaseService = {
  // ==========================================
  // Purchase Bills (فواتير المشتريات)
  // ==========================================
  async getPurchaseBills(orgId: string, options?: { showDeleted?: boolean; onlyDeleted?: boolean }): Promise<PurchaseBill[]> {
    let query = supabase
      .from('purchase_bills')
      .select('*, vendor:vendors(*)')
      .eq('organization_id', orgId);

    if (options?.onlyDeleted) {
      query = query.not('deleted_at', 'is', null);
    } else if (!options?.showDeleted) {
      query = query.is('deleted_at', null);
    }

    const { data, error } = await query.order('created_at', { ascending: false });

    if (error) throw error;
    return (data || []) as PurchaseBill[];
  },

  async getPurchaseBill(orgId: string, billId: string): Promise<PurchaseBill> {
    const { data, error } = await supabase
      .from('purchase_bills')
      .select('*, vendor:vendors(*), lines:purchase_bill_lines(*, item:items(*))')
      .eq('organization_id', orgId)
      .eq('id', billId)
      .single();

    if (error) throw error;
    return data as PurchaseBill;
  },

  async createPurchaseBill(orgId: string, input: CreatePurchaseBillInput): Promise<string> {
    const { data, error } = await supabase.rpc('create_purchase_bill', {
      p_org_id: orgId,
      p_vendor_id: input.vendor_id,
      p_vendor_invoice_number: input.vendor_invoice_number || null,
      p_bill_date: input.bill_date,
      p_due_date: input.due_date,
      p_notes: input.notes || null,
      p_lines: input.lines,
      p_prices_include_tax: input.prices_include_tax ?? false,
      p_payment_method: input.payment_method || 'credit',
      p_payment_reference: input.payment_reference || null,
      p_payment_notes: input.payment_notes || null,
      p_payment_details: input.payment_details || {}
    });

    if (error) throw error;
    return data as string;
  },

  async updatePurchaseBill(orgId: string, billId: string, input: CreatePurchaseBillInput): Promise<void> {
    const { error } = await supabase.rpc('update_purchase_bill', {
      p_org_id: orgId,
      p_bill_id: billId,
      p_vendor_id: input.vendor_id,
      p_vendor_invoice_number: input.vendor_invoice_number || null,
      p_bill_date: input.bill_date,
      p_due_date: input.due_date,
      p_notes: input.notes || null,
      p_lines: input.lines,
      p_prices_include_tax: input.prices_include_tax ?? false,
      p_payment_method: input.payment_method || 'credit',
      p_payment_reference: input.payment_reference || null,
      p_payment_notes: input.payment_notes || null,
      p_payment_details: input.payment_details || {}
    });

    if (error) throw error;
  },

  async deleteDraftPurchaseBill(orgId: string, billId: string): Promise<void> {
    const { error } = await supabase.rpc('delete_draft_purchase_bill', {
      p_org_id: orgId,
      p_bill_id: billId,
    });

    if (error) throw error;
  },

  async softDeletePurchaseBill(billId: string, reason: string): Promise<void> {
    const { error } = await supabase.rpc('soft_delete_purchase_bill', {
      p_bill_id: billId,
      p_reason: reason,
    });
    if (error) throw error;
  },

  async restorePurchaseBill(billId: string): Promise<void> {
    const { error } = await supabase.rpc('restore_purchase_bill', {
      p_bill_id: billId,
    });
    if (error) throw error;
  },

  async permanentlyDeletePurchaseBill(billId: string): Promise<void> {
    const { error } = await supabase.rpc('permanently_delete_purchase_bill', {
      p_bill_id: billId,
    });
    if (error) throw error;
  },

  async approvePurchaseBill(orgId: string, billId: string): Promise<string> {
    const { data, error } = await supabase.rpc('approve_purchase_bill', {
      p_org_id: orgId,
      p_bill_id: billId,
    });

    if (error) throw error;
    return data as string;
  },

  async cancelPurchaseBill(orgId: string, billId: string): Promise<string> {
    const { data, error } = await supabase.rpc('cancel_purchase_bill', {
      p_org_id: orgId,
      p_bill_id: billId,
    });

    if (error) throw error;
    return data as string;
  },


  // ==========================================
  // Payments (سندات الصرف)
  // ==========================================
  async getPayments(orgId: string, options?: { showDeleted?: boolean; onlyDeleted?: boolean }): Promise<Payment[]> {
    let query = supabase
      .from('payments')
      .select('*, vendor:vendors(*), cash_bank_account:cash_bank_accounts(*)')
      .eq('organization_id', orgId);

    if (options?.onlyDeleted) {
      query = query.not('deleted_at', 'is', null);
    } else if (!options?.showDeleted) {
      query = query.is('deleted_at', null);
    }

    const { data, error } = await query.order('created_at', { ascending: false });

    if (error) throw error;
    return (data || []) as Payment[];
  },

  async getPayment(orgId: string, paymentId: string): Promise<Payment> {
    const { data, error } = await supabase
      .from('payments')
      .select('*, vendor:vendors(*), cash_bank_account:cash_bank_accounts(*), allocations:payment_allocations(*, purchase_bill:purchase_bills(*))')
      .eq('organization_id', orgId)
      .eq('id', paymentId)
      .single();

    if (error) throw error;
    return data as Payment;
  },

  async createPayment(orgId: string, input: CreatePaymentInput): Promise<string> {
    const { data, error } = await supabase.rpc('create_payment', {
      p_org_id: orgId,
      p_vendor_id: input.vendor_id,
      p_payment_date: input.payment_date,
      p_amount: input.amount,
      p_payment_method: input.payment_method,
      p_cash_account_id: input.cash_account_id || null,
      p_bank_account_id: input.bank_account_id || null,
      p_reference: input.reference || null,
      p_notes: input.notes || null,
      p_allocations: input.allocations,
      p_cash_bank_account_id: input.cash_bank_account_id || null,
    });

    if (error) throw error;
    return data as string;
  },

  async updatePayment(orgId: string, paymentId: string, input: CreatePaymentInput): Promise<void> {
    const { error } = await supabase.rpc('update_payment', {
      p_org_id: orgId,
      p_payment_id: paymentId,
      p_vendor_id: input.vendor_id,
      p_payment_date: input.payment_date,
      p_amount: input.amount,
      p_payment_method: input.payment_method,
      p_cash_account_id: input.cash_account_id || null,
      p_bank_account_id: input.bank_account_id || null,
      p_reference: input.reference || null,
      p_notes: input.notes || null,
      p_allocations: input.allocations,
      p_cash_bank_account_id: input.cash_bank_account_id || null,
    });

    if (error) throw error;
  },

  async deleteDraftPayment(orgId: string, paymentId: string): Promise<void> {
    const { error } = await supabase.rpc('delete_draft_payment', {
      p_org_id: orgId,
      p_payment_id: paymentId,
    });

    if (error) throw error;
  },

  async softDeletePayment(paymentId: string, reason: string): Promise<void> {
    const { error } = await supabase.rpc('soft_delete_payment', {
      p_payment_id: paymentId,
      p_reason: reason,
    });
    if (error) throw error;
  },

  async restorePayment(paymentId: string): Promise<void> {
    const { error } = await supabase.rpc('restore_payment', {
      p_payment_id: paymentId,
    });
    if (error) throw error;
  },

  async permanentlyDeletePayment(paymentId: string): Promise<void> {
    const { error } = await supabase.rpc('permanently_delete_payment', {
      p_payment_id: paymentId,
    });
    if (error) throw error;
  },

  async approvePayment(orgId: string, paymentId: string): Promise<string> {
    const { data, error } = await supabase.rpc('approve_payment', {
      p_org_id: orgId,
      p_payment_id: paymentId,
    });

    if (error) throw error;
    return data as string;
  },

  async cancelPayment(orgId: string, paymentId: string): Promise<string> {
    const { data, error } = await supabase.rpc('cancel_payment', {
      p_org_id: orgId,
      p_payment_id: paymentId,
    });

    if (error) throw error;
    return data as string;
  },

  // ==========================================
  // Purchase Debit Notes (إشعارات المشتريات المدينة)
  // ==========================================
  async getPurchaseDebitNotes(orgId: string, options?: { showDeleted?: boolean; onlyDeleted?: boolean }): Promise<PurchaseDebitNote[]> {
    let query = supabase
      .from('purchase_debit_notes')
      .select('*, vendor:vendors(*), original_bill:purchase_bills(*), lines:purchase_debit_note_lines(*, item:items(*))')
      .eq('organization_id', orgId);

    if (options?.onlyDeleted) {
      query = query.not('deleted_at', 'is', null);
    } else if (!options?.showDeleted) {
      query = query.is('deleted_at', null);
    }

    const { data, error } = await query.order('created_at', { ascending: false });

    if (error) throw error;
    return (data || []) as PurchaseDebitNote[];
  },

  async getPurchaseDebitNote(orgId: string, debitNoteId: string): Promise<PurchaseDebitNote> {
    const { data, error } = await supabase
      .from('purchase_debit_notes')
      .select('*, vendor:vendors(*), original_bill:purchase_bills(*), lines:purchase_debit_note_lines(*, item:items(*))')
      .eq('organization_id', orgId)
      .eq('id', debitNoteId)
      .single();

    if (error) throw error;
    return data as PurchaseDebitNote;
  },

  async createPurchaseDebitNote(
    orgId: string,
    input: { original_bill_id: string; debit_note_date: string; reason?: string; notes?: string }
  ): Promise<string> {
    const { data, error } = await supabase.rpc('create_purchase_debit_note', {
      p_organization_id: orgId,
      p_original_bill_id: input.original_bill_id,
      p_debit_note_date: input.debit_note_date,
      p_reason: input.reason || null,
      p_notes: input.notes || null,
    });

    if (error) throw error;
    return data as string;
  },

  async addPurchaseDebitNoteLine(
    debitNoteId: string,
    originalBillLineId: string,
    quantity: number
  ): Promise<string> {
    const { data, error } = await supabase.rpc('add_purchase_debit_note_line', {
      p_debit_note_id: debitNoteId,
      p_original_bill_line_id: originalBillLineId,
      p_quantity: quantity,
    });

    if (error) throw error;
    return data as string;
  },

  async approvePurchaseDebitNote(debitNoteId: string): Promise<string> {
    const { data, error } = await supabase.rpc('approve_purchase_debit_note', {
      p_debit_note_id: debitNoteId,
    });

    if (error) throw error;
    return data as string;
  },

  async cancelPurchaseDebitNote(debitNoteId: string, reason: string): Promise<string> {
    const { data, error } = await supabase.rpc('cancel_purchase_debit_note', {
      p_debit_note_id: debitNoteId,
      p_reason: reason,
    });

    if (error) throw error;
    return data as string;
  },

  async softDeletePurchaseDebitNote(debitNoteId: string, reason: string): Promise<void> {
    const { error } = await supabase.rpc('soft_delete_purchase_debit_note', {
      p_debit_note_id: debitNoteId,
      p_reason: reason,
    });
    if (error) throw error;
  },

  async restorePurchaseDebitNote(debitNoteId: string): Promise<void> {
    const { error } = await supabase.rpc('restore_purchase_debit_note', {
      p_debit_note_id: debitNoteId,
    });
    if (error) throw error;
  },

  async permanentlyDeletePurchaseDebitNote(debitNoteId: string): Promise<void> {
    const { error } = await supabase.rpc('permanently_delete_purchase_debit_note', {
      p_debit_note_id: debitNoteId,
    });
    if (error) throw error;
  }
};
