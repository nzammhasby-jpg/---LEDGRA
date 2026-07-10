import { supabase } from './supabase';
import { 
  SalesInvoice, 
  SalesInvoiceStatus, 
  PaymentStatus, 
  Receipt, 
  PaymentMethod,
  ReceiptStatus,
  SalesCreditNote
} from '../types';

export interface CreateInvoiceInput {
  customer_id: string;
  invoice_date: string;
  due_date: string;
  notes?: string;
  lines: Array<{
    item_id: string;
    description?: string;
    quantity: number;
    unit_price: number;
    discount_amount?: number;
    tax_rate?: number;
    revenue_account_id?: string;
  }>;
}

export interface CreateReceiptInput {
  customer_id: string;
  receipt_date: string;
  amount: number;
  payment_method: PaymentMethod;
  cash_account_id?: string;
  bank_account_id?: string;
  cash_bank_account_id?: string;
  reference?: string;
  notes?: string;
  allocations: Array<{
    sales_invoice_id: string;
    allocated_amount: number;
  }>;
}

export const salesService = {
  // ==========================================
  // Sales Invoices (فواتير المبيعات)
  // ==========================================
  async getSalesInvoices(orgId: string, options?: { showDeleted?: boolean; onlyDeleted?: boolean }): Promise<SalesInvoice[]> {
    let query = supabase
      .from('sales_invoices')
      .select('*, customer:customers(*)')
      .eq('organization_id', orgId);

    if (options?.onlyDeleted) {
      query = query.not('deleted_at', 'is', null);
    } else if (!options?.showDeleted) {
      query = query.is('deleted_at', null);
    }

    const { data, error } = await query.order('created_at', { ascending: false });

    if (error) throw error;
    return (data || []) as SalesInvoice[];
  },

  async getSalesInvoice(orgId: string, invoiceId: string): Promise<SalesInvoice> {
    const { data, error } = await supabase
      .from('sales_invoices')
      .select('*, customer:customers(*), lines:sales_invoice_lines(*, item:items(*))')
      .eq('organization_id', orgId)
      .eq('id', invoiceId)
      .single();

    if (error) throw error;
    return data as SalesInvoice;
  },

  async createSalesInvoice(orgId: string, input: CreateInvoiceInput): Promise<string> {
    const { data, error } = await supabase.rpc('create_sales_invoice', {
      p_org_id: orgId,
      p_customer_id: input.customer_id,
      p_invoice_date: input.invoice_date,
      p_due_date: input.due_date,
      p_notes: input.notes || null,
      p_lines: input.lines,
    });

    if (error) throw error;
    return data as string;
  },

  async updateSalesInvoice(orgId: string, invoiceId: string, input: CreateInvoiceInput): Promise<void> {
    const { error } = await supabase.rpc('update_sales_invoice', {
      p_org_id: orgId,
      p_invoice_id: invoiceId,
      p_customer_id: input.customer_id,
      p_invoice_date: input.invoice_date,
      p_due_date: input.due_date,
      p_notes: input.notes || null,
      p_lines: input.lines,
    });

    if (error) throw error;
  },

  async deleteDraftSalesInvoice(orgId: string, invoiceId: string): Promise<void> {
    const { error } = await supabase.rpc('delete_draft_sales_invoice', {
      p_org_id: orgId,
      p_invoice_id: invoiceId,
    });

    if (error) throw error;
  },

  async softDeleteSalesInvoice(invoiceId: string, reason: string): Promise<void> {
    const { error } = await supabase.rpc('soft_delete_sales_invoice', {
      p_invoice_id: invoiceId,
      p_reason: reason,
    });
    if (error) throw error;
  },

  async restoreSalesInvoice(invoiceId: string): Promise<void> {
    const { error } = await supabase.rpc('restore_sales_invoice', {
      p_invoice_id: invoiceId,
    });
    if (error) throw error;
  },

  async permanentlyDeleteSalesInvoice(invoiceId: string): Promise<void> {
    const { error } = await supabase.rpc('permanently_delete_sales_invoice', {
      p_invoice_id: invoiceId,
    });
    if (error) throw error;
  },

  async approveSalesInvoice(orgId: string, invoiceId: string): Promise<string> {
    const { data, error } = await supabase.rpc('approve_sales_invoice', {
      p_org_id: orgId,
      p_invoice_id: invoiceId,
    });

    if (error) throw error;
    return data as string;
  },

  async cancelSalesInvoice(orgId: string, invoiceId: string): Promise<string> {
    const { data, error } = await supabase.rpc('cancel_sales_invoice', {
      p_org_id: orgId,
      p_invoice_id: invoiceId,
    });

    if (error) throw error;
    return data as string;
  },


  // ==========================================
  // Receipts (سندات القبض)
  // ==========================================
  async getReceipts(orgId: string, options?: { showDeleted?: boolean; onlyDeleted?: boolean }): Promise<Receipt[]> {
    let query = supabase
      .from('receipts')
      .select('*, customer:customers(*), cash_bank_account:cash_bank_accounts(*)')
      .eq('organization_id', orgId);

    if (options?.onlyDeleted) {
      query = query.not('deleted_at', 'is', null);
    } else if (!options?.showDeleted) {
      query = query.is('deleted_at', null);
    }

    const { data, error } = await query.order('created_at', { ascending: false });

    if (error) throw error;
    return (data || []) as Receipt[];
  },

  async getReceipt(orgId: string, receiptId: string): Promise<Receipt> {
    const { data, error } = await supabase
      .from('receipts')
      .select('*, customer:customers(*), cash_bank_account:cash_bank_accounts(*), allocations:receipt_allocations(*, sales_invoice:sales_invoices(*))')
      .eq('organization_id', orgId)
      .eq('id', receiptId)
      .single();

    if (error) throw error;
    return data as Receipt;
  },

  async createReceipt(orgId: string, input: CreateReceiptInput): Promise<string> {
    const { data, error } = await supabase.rpc('create_receipt', {
      p_org_id: orgId,
      p_customer_id: input.customer_id,
      p_receipt_date: input.receipt_date,
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

  async updateReceipt(orgId: string, receiptId: string, input: CreateReceiptInput): Promise<void> {
    const { error } = await supabase.rpc('update_receipt', {
      p_org_id: orgId,
      p_receipt_id: receiptId,
      p_customer_id: input.customer_id,
      p_receipt_date: input.receipt_date,
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

  async deleteDraftReceipt(orgId: string, receiptId: string): Promise<void> {
    const { error } = await supabase.rpc('delete_draft_receipt', {
      p_org_id: orgId,
      p_receipt_id: receiptId,
    });

    if (error) throw error;
  },

  async softDeleteReceipt(receiptId: string, reason: string): Promise<void> {
    const { error } = await supabase.rpc('soft_delete_receipt', {
      p_receipt_id: receiptId,
      p_reason: reason,
    });
    if (error) throw error;
  },

  async restoreReceipt(receiptId: string): Promise<void> {
    const { error } = await supabase.rpc('restore_receipt', {
      p_receipt_id: receiptId,
    });
    if (error) throw error;
  },

  async permanentlyDeleteReceipt(receiptId: string): Promise<void> {
    const { error } = await supabase.rpc('permanently_delete_receipt', {
      p_receipt_id: receiptId,
    });
    if (error) throw error;
  },

  async approveReceipt(orgId: string, receiptId: string): Promise<string> {
    const { data, error } = await supabase.rpc('approve_receipt', {
      p_org_id: orgId,
      p_receipt_id: receiptId,
    });

    if (error) throw error;
    return data as string;
  },

  async cancelReceipt(orgId: string, receiptId: string): Promise<string> {
    const { data, error } = await supabase.rpc('cancel_receipt', {
      p_org_id: orgId,
      p_receipt_id: receiptId,
    });

    if (error) throw error;
    return data as string;
  },

  // ==========================================
  // Sales Credit Notes (إشعارات المبيعات الدائنة)
  // ==========================================
  async getCreditNotes(orgId: string, options?: { showDeleted?: boolean; onlyDeleted?: boolean }): Promise<SalesCreditNote[]> {
    let query = supabase
      .from('sales_credit_notes')
      .select('*, customer:customers(*), original_invoice:sales_invoices(*)')
      .eq('organization_id', orgId);

    if (options?.onlyDeleted) {
      query = query.not('deleted_at', 'is', null);
    } else if (!options?.showDeleted) {
      query = query.is('deleted_at', null);
    }

    const { data, error } = await query.order('created_at', { ascending: false });

    if (error) throw error;
    return (data || []) as SalesCreditNote[];
  },

  async getCreditNote(orgId: string, id: string): Promise<SalesCreditNote> {
    const { data, error } = await supabase
      .from('sales_credit_notes')
      .select('*, customer:customers(*), original_invoice:sales_invoices(*), lines:sales_credit_note_lines(*, item:items(*))')
      .eq('organization_id', orgId)
      .eq('id', id)
      .single();

    if (error) throw error;
    return data as SalesCreditNote;
  },

  async createCreditNote(
    orgId: string,
    invoiceId: string,
    date?: string,
    reason?: string,
    notes?: string
  ): Promise<string> {
    const { data, error } = await supabase.rpc('create_sales_credit_note', {
      p_organization_id: orgId,
      p_original_invoice_id: invoiceId,
      p_credit_note_date: date || new Date().toISOString().split('T')[0],
      p_reason: reason || null,
      p_notes: notes || null
    });

    if (error) throw error;
    return data as string;
  },

  async addCreditNoteLine(
    creditNoteId: string,
    invoiceLineId: string,
    quantity: number
  ): Promise<string> {
    const { data, error } = await supabase.rpc('add_sales_credit_note_line', {
      p_credit_note_id: creditNoteId,
      p_original_invoice_line_id: invoiceLineId,
      p_quantity: quantity
    });

    if (error) throw error;
    return data as string;
  },

  async approveCreditNote(creditNoteId: string): Promise<string> {
    const { data, error } = await supabase.rpc('approve_sales_credit_note', {
      p_credit_note_id: creditNoteId
    });

    if (error) throw error;
    return data as string;
  },

  async cancelCreditNote(creditNoteId: string, reason: string): Promise<string> {
    const { data, error } = await supabase.rpc('cancel_sales_credit_note', {
      p_credit_note_id: creditNoteId,
      p_reason: reason
    });

    if (error) throw error;
    return data as string;
  },

  async softDeleteSalesCreditNote(creditNoteId: string, reason: string): Promise<void> {
    const { error } = await supabase.rpc('soft_delete_sales_credit_note', {
      p_credit_note_id: creditNoteId,
      p_reason: reason,
    });
    if (error) throw error;
  },

  async restoreSalesCreditNote(creditNoteId: string): Promise<void> {
    const { error } = await supabase.rpc('restore_sales_credit_note', {
      p_credit_note_id: creditNoteId,
    });
    if (error) throw error;
  },

  async permanentlyDeleteSalesCreditNote(creditNoteId: string): Promise<void> {
    const { error } = await supabase.rpc('permanently_delete_sales_credit_note', {
      p_credit_note_id: creditNoteId,
    });
    if (error) throw error;
  }
};
