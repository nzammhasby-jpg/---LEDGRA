import { supabase } from './supabase';
import { 
  SalesQuotation, 
  QuotationStatus, 
  InvoicePaymentMethod, 
  PaymentDetails 
} from '../types';

export interface CreateQuotationInput {
  customer_id: string;
  quotation_date: string;
  valid_until?: string;
  notes?: string;
  terms_and_conditions?: string;
  prices_include_tax?: boolean;
  payment_method?: InvoicePaymentMethod;
  payment_reference?: string;
  payment_notes?: string;
  payment_details?: PaymentDetails;
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

export const quotationService = {
  async getSalesQuotations(orgId: string, options?: { showDeleted?: boolean; onlyDeleted?: boolean }): Promise<SalesQuotation[]> {
    let query = supabase
      .from('sales_quotations')
      .select('*, customer:customers(*)')
      .eq('organization_id', orgId);

    if (options?.onlyDeleted) {
      query = query.not('deleted_at', 'is', null);
    } else if (!options?.showDeleted) {
      query = query.is('deleted_at', null);
    }

    const { data, error } = await query.order('created_at', { ascending: false });

    if (error) throw error;
    return (data || []) as SalesQuotation[];
  },

  async getSalesQuotation(orgId: string, quotationId: string): Promise<SalesQuotation> {
    const { data, error } = await supabase
      .from('sales_quotations')
      .select('*, customer:customers(*), lines:sales_quotation_lines(*, item:items(*))')
      .eq('organization_id', orgId)
      .eq('id', quotationId)
      .single();

    if (error) throw error;
    return data as SalesQuotation;
  },

  async createSalesQuotation(orgId: string, input: CreateQuotationInput): Promise<string> {
    const { data, error } = await supabase.rpc('create_sales_quotation', {
      p_org_id: orgId,
      p_customer_id: input.customer_id,
      p_quotation_date: input.quotation_date,
      p_valid_until: input.valid_until || null,
      p_notes: input.notes || null,
      p_terms_and_conditions: input.terms_and_conditions || null,
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

  async updateSalesQuotation(orgId: string, quotationId: string, input: CreateQuotationInput): Promise<void> {
    const { error } = await supabase.rpc('update_sales_quotation', {
      p_org_id: orgId,
      p_quotation_id: quotationId,
      p_customer_id: input.customer_id,
      p_quotation_date: input.quotation_date,
      p_valid_until: input.valid_until || null,
      p_notes: input.notes || null,
      p_terms_and_conditions: input.terms_and_conditions || null,
      p_lines: input.lines,
      p_prices_include_tax: input.prices_include_tax ?? false,
      p_payment_method: input.payment_method || 'credit',
      p_payment_reference: input.payment_reference || null,
      p_payment_notes: input.payment_notes || null,
      p_payment_details: input.payment_details || {}
    });

    if (error) throw error;
  },

  async updateQuotationStatus(orgId: string, quotationId: string, status: QuotationStatus): Promise<void> {
    const { error } = await supabase
      .from('sales_quotations')
      .update({ status, updated_at: new Date().toISOString() })
      .eq('organization_id', orgId)
      .eq('id', quotationId);

    if (error) throw error;
  },

  async convertQuotationToInvoice(orgId: string, quotationId: string): Promise<string> {
    const { data, error } = await supabase.rpc('convert_quotation_to_invoice', {
      p_org_id: orgId,
      p_quotation_id: quotationId
    });

    if (error) throw error;
    return data as string;
  },

  async deleteDraftSalesQuotation(orgId: string, quotationId: string): Promise<void> {
    const { error } = await supabase
      .from('sales_quotations')
      .delete()
      .eq('organization_id', orgId)
      .eq('id', quotationId)
      .eq('status', 'draft');

    if (error) throw error;
  }
};
