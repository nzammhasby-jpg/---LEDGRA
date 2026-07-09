import { supabase } from './supabase';
import { 
  PurchaseBill, 
  PurchaseBillStatus, 
  PaymentStatus, 
  Payment, 
  PaymentMethod,
  PaymentStatusType
} from '../types';

export interface CreatePurchaseBillInput {
  vendor_id: string;
  vendor_invoice_number?: string;
  bill_date: string;
  due_date: string;
  notes?: string;
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
  async getPurchaseBills(orgId: string): Promise<PurchaseBill[]> {
    const { data, error } = await supabase
      .from('purchase_bills')
      .select('*, vendor:vendors(*)')
      .eq('organization_id', orgId)
      .order('created_at', { ascending: false });

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
  async getPayments(orgId: string): Promise<Payment[]> {
    const { data, error } = await supabase
      .from('payments')
      .select('*, vendor:vendors(*), cash_bank_account:cash_bank_accounts(*)')
      .eq('organization_id', orgId)
      .order('created_at', { ascending: false });

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
  }
};
