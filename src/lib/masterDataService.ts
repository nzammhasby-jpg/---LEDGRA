import { supabase } from './supabase';
import { Customer, Vendor, Item, CustomerType, VendorType, ItemType, OpeningBalanceType } from '../types';

export const masterDataService = {
  // ==========================================
  // Customers (العملاء)
  // ==========================================
  async getCustomers(orgId: string): Promise<Customer[]> {
    const { data, error } = await supabase
      .from('customers')
      .select('*, receivable_account:accounts!customers_receivable_account_fk(*)')
      .eq('organization_id', orgId)
      .order('code', { ascending: true });

    if (error) throw error;
    return (data || []) as Customer[];
  },

  async createCustomer(
    orgId: string,
    input: {
      code: string;
      name: string;
      display_name?: string;
      customer_type: CustomerType;
      tax_number?: string;
      commercial_registration?: string;
      email?: string;
      phone?: string;
      mobile?: string;
      city?: string;
      address?: string;
      opening_balance?: number;
      opening_balance_type?: OpeningBalanceType;
      receivable_account_id: string;
      notes?: string;
    }
  ): Promise<string> {
    const { data, error } = await supabase.rpc('create_customer', {
      p_org_id: orgId,
      p_code: input.code,
      p_name: input.name,
      p_display_name: input.display_name || null,
      p_customer_type: input.customer_type,
      p_tax_number: input.tax_number || null,
      p_commercial_registration: input.commercial_registration || null,
      p_email: input.email || null,
      p_phone: input.phone || null,
      p_mobile: input.mobile || null,
      p_city: input.city || null,
      p_address: input.address || null,
      p_opening_balance: input.opening_balance || 0.00,
      p_opening_balance_type: input.opening_balance_type || 'debit',
      p_receivable_account_id: input.receivable_account_id,
      p_notes: input.notes || null,
    });

    if (error) throw error;
    return data as string;
  },

  async updateCustomer(
    orgId: string,
    customerId: string,
    input: {
      code: string;
      name: string;
      display_name?: string;
      customer_type: CustomerType;
      tax_number?: string;
      commercial_registration?: string;
      email?: string;
      phone?: string;
      mobile?: string;
      city?: string;
      address?: string;
      opening_balance?: number;
      opening_balance_type?: OpeningBalanceType;
      receivable_account_id: string;
      is_active: boolean;
      notes?: string;
    }
  ): Promise<void> {
    const { error } = await supabase.rpc('update_customer', {
      p_org_id: orgId,
      p_customer_id: customerId,
      p_code: input.code,
      p_name: input.name,
      p_display_name: input.display_name || null,
      p_customer_type: input.customer_type,
      p_tax_number: input.tax_number || null,
      p_commercial_registration: input.commercial_registration || null,
      p_email: input.email || null,
      p_phone: input.phone || null,
      p_mobile: input.mobile || null,
      p_city: input.city || null,
      p_address: input.address || null,
      p_opening_balance: input.opening_balance || 0.00,
      p_opening_balance_type: input.opening_balance_type || 'debit',
      p_receivable_account_id: input.receivable_account_id,
      p_is_active: input.is_active,
      p_notes: input.notes || null,
    });

    if (error) throw error;
  },

  // ==========================================
  // Vendors (الموردون)
  // ==========================================
  async getVendors(orgId: string): Promise<Vendor[]> {
    const { data, error } = await supabase
      .from('vendors')
      .select('*, payable_account:accounts!vendors_payable_account_fk(*)')
      .eq('organization_id', orgId)
      .order('code', { ascending: true });

    if (error) throw error;
    return (data || []) as Vendor[];
  },

  async createVendor(
    orgId: string,
    input: {
      code: string;
      name: string;
      display_name?: string;
      vendor_type: VendorType;
      tax_number?: string;
      commercial_registration?: string;
      email?: string;
      phone?: string;
      mobile?: string;
      city?: string;
      address?: string;
      opening_balance?: number;
      opening_balance_type?: OpeningBalanceType;
      payable_account_id: string;
      notes?: string;
    }
  ): Promise<string> {
    const { data, error } = await supabase.rpc('create_vendor', {
      p_org_id: orgId,
      p_code: input.code,
      p_name: input.name,
      p_display_name: input.display_name || null,
      p_vendor_type: input.vendor_type,
      p_tax_number: input.tax_number || null,
      p_commercial_registration: input.commercial_registration || null,
      p_email: input.email || null,
      p_phone: input.phone || null,
      p_mobile: input.mobile || null,
      p_city: input.city || null,
      p_address: input.address || null,
      p_opening_balance: input.opening_balance || 0.00,
      p_opening_balance_type: input.opening_balance_type || 'credit',
      p_payable_account_id: input.payable_account_id,
      p_notes: input.notes || null,
    });

    if (error) throw error;
    return data as string;
  },

  async updateVendor(
    orgId: string,
    vendorId: string,
    input: {
      code: string;
      name: string;
      display_name?: string;
      vendor_type: VendorType;
      tax_number?: string;
      commercial_registration?: string;
      email?: string;
      phone?: string;
      mobile?: string;
      city?: string;
      address?: string;
      opening_balance?: number;
      opening_balance_type?: OpeningBalanceType;
      payable_account_id: string;
      is_active: boolean;
      notes?: string;
    }
  ): Promise<void> {
    const { error } = await supabase.rpc('update_vendor', {
      p_org_id: orgId,
      p_vendor_id: vendorId,
      p_code: input.code,
      p_name: input.name,
      p_display_name: input.display_name || null,
      p_vendor_type: input.vendor_type,
      p_tax_number: input.tax_number || null,
      p_commercial_registration: input.commercial_registration || null,
      p_email: input.email || null,
      p_phone: input.phone || null,
      p_mobile: input.mobile || null,
      p_city: input.city || null,
      p_address: input.address || null,
      p_opening_balance: input.opening_balance || 0.00,
      p_opening_balance_type: input.opening_balance_type || 'credit',
      p_payable_account_id: input.payable_account_id,
      p_is_active: input.is_active,
      p_notes: input.notes || null,
    });

    if (error) throw error;
  },

  // ==========================================
  // Items & Products / Services (المنتجات والخدمات)
  // ==========================================
  async getItems(orgId: string): Promise<Item[]> {
    const { data, error } = await supabase
      .from('items')
      .select(`
        *,
        sales_account:accounts!items_sales_account_fk(*),
        service_revenue_account:accounts!items_service_revenue_account_fk(*),
        inventory_account:accounts!items_inventory_account_fk(*),
        cogs_account:accounts!items_cogs_account_fk(*),
        expense_account:accounts!items_expense_account_fk(*)
      `)
      .eq('organization_id', orgId)
      .order('code', { ascending: true });

    if (error) throw error;
    return (data || []) as Item[];
  },

  async createItem(
    orgId: string,
    input: {
      item_type: ItemType;
      code: string;
      name: string;
      description?: string;
      unit?: string;
      sku?: string;
      barcode?: string;
      selling_price?: number;
      purchase_price?: number;
      tax_rate?: number;
      sales_account_id?: string;
      service_revenue_account_id?: string;
      inventory_account_id?: string;
      cogs_account_id?: string;
      expense_account_id?: string;
      is_stockable?: boolean;
    }
  ): Promise<string> {
    const { data, error } = await supabase.rpc('create_item', {
      p_org_id: orgId,
      p_item_type: input.item_type,
      p_code: input.code,
      p_name: input.name,
      p_description: input.description || null,
      p_unit: input.unit || null,
      p_sku: input.sku || null,
      p_barcode: input.barcode || null,
      p_selling_price: input.selling_price || 0.00,
      p_purchase_price: input.purchase_price || 0.00,
      p_tax_rate: input.tax_rate || 0.00,
      p_sales_account_id: input.sales_account_id || null,
      p_service_revenue_account_id: input.service_revenue_account_id || null,
      p_inventory_account_id: input.inventory_account_id || null,
      p_cogs_account_id: input.cogs_account_id || null,
      p_expense_account_id: input.expense_account_id || null,
      p_is_stockable: input.is_stockable || false,
    });

    if (error) throw error;
    return data as string;
  },

  async updateItem(
    orgId: string,
    itemId: string,
    input: {
      item_type: ItemType;
      code: string;
      name: string;
      description?: string;
      unit?: string;
      sku?: string;
      barcode?: string;
      selling_price?: number;
      purchase_price?: number;
      tax_rate?: number;
      sales_account_id?: string;
      service_revenue_account_id?: string;
      inventory_account_id?: string;
      cogs_account_id?: string;
      expense_account_id?: string;
      is_stockable?: boolean;
      is_active: boolean;
    }
  ): Promise<void> {
    const { error } = await supabase.rpc('update_item', {
      p_org_id: orgId,
      p_item_id: itemId,
      p_item_type: input.item_type,
      p_code: input.code,
      p_name: input.name,
      p_description: input.description || null,
      p_unit: input.unit || null,
      p_sku: input.sku || null,
      p_barcode: input.barcode || null,
      p_selling_price: input.selling_price || 0.00,
      p_purchase_price: input.purchase_price || 0.00,
      p_tax_rate: input.tax_rate || 0.00,
      p_sales_account_id: input.sales_account_id || null,
      p_service_revenue_account_id: input.service_revenue_account_id || null,
      p_inventory_account_id: input.inventory_account_id || null,
      p_cogs_account_id: input.cogs_account_id || null,
      p_expense_account_id: input.expense_account_id || null,
      p_is_stockable: input.is_stockable || false,
      p_is_active: input.is_active,
    });

    if (error) throw error;
  },
};
