import { supabase } from './supabase';
import { 
  SalesInvoice, 
  SalesInvoiceStatus, 
  PaymentStatus, 
  Receipt, 
  PaymentMethod,
  ReceiptStatus
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
  async getSalesInvoices(orgId: string): Promise<SalesInvoice[]> {
    const { data, error } = await supabase
      .from('sales_invoices')
      .select('*, customer:customers(*)')
      .eq('organization_id', orgId)
      .order('created_at', { ascending: false });

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
  async getReceipts(orgId: string): Promise<Receipt[]> {
    const { data, error } = await supabase
      .from('receipts')
      .select('*, customer:customers(*)')
      .eq('organization_id', orgId)
      .order('created_at', { ascending: false });

    if (error) throw error;
    return (data || []) as Receipt[];
  },

  async getReceipt(orgId: string, receiptId: string): Promise<Receipt> {
    const { data, error } = await supabase
      .from('receipts')
      .select('*, customer:customers(*), allocations:receipt_allocations(*, sales_invoice:sales_invoices(*))')
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
};
