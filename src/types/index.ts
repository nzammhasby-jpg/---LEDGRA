export interface Profile {
  id: string;
  full_name: string | null;
  phone: string | null;
  avatar_url: string | null;
  created_at: string;
}

export type OrganizationRole = 'owner' | 'admin' | 'accountant' | 'sales' | 'viewer';

export interface Organization {
  id: string;
  name_ar: string;
  name_en: string | null;
  activity_type: string | null;
  country_code: string;
  city: string | null;
  phone: string | null;
  email: string | null;
  logo_url: string | null;
  legal_type: string | null;
  vat_number: string | null;
  is_vat_registered: boolean;
  fiscal_year_start: string | null;
  currency_code: string;
  primary_language: string;
  onboarding_completed: boolean;
  onboarding_step?: number;
  setup_completed_at?: string | null;
  cr_number: string | null;
  created_by: string | null;
  system_start_date: string | null;
  accounting_mode: string | null;
  starting_balances_later: boolean | null;
  updated_at: string | null;
  created_at: string;
}

export interface OrganizationMember {
  id: string;
  organization_id: string;
  profile_id: string;
  role: OrganizationRole;
  created_at: string;
  profile?: Profile;
}

export interface Branch {
  id: string;
  organization_id: string;
  name_ar: string;
  name_en: string | null;
  code: string | null;
  address: string | null;
  is_main: boolean;
  created_at: string;
}

export interface AuditLog {
  id: string;
  organization_id: string | null;
  profile_id: string | null;
  action: string;
  details: Record<string, any>;
  ip_address: string | null;
  created_at: string;
  profile?: Profile;
}

export interface Notification {
  id: string;
  organization_id: string;
  profile_id: string;
  title: string;
  message: string;
  type: 'info' | 'warning' | 'success' | 'error';
  is_read: boolean;
  created_at: string;
}

// Client Side Extra State Options
export interface AppState {
  currentOrganization: Organization | null;
  organizationsList: Organization[];
  userInfo: Profile | null;
}

export interface CreateOrgInput {
  name_ar: string;
  name_en?: string;
  activity_type?: string;
  city?: string;
  phone?: string;
  email?: string;
  legal_type?: string;
  vat_number?: string;
  is_vat_registered: boolean;
  fiscal_year_start?: string;
  cr_number?: string;
  system_start_date?: string;
  accounting_mode?: string;
  starting_balances_later: boolean;
  onboarding_completed?: boolean;
  onboarding_step?: number;
}

export interface MembershipJoinData {
  organization_id: string;
  role: OrganizationRole;
  organizations: Organization | null;
}

export interface CustomDatabaseError {
  message: string;
  code?: string;
  details?: string;
  hint?: string;
}

export interface FiscalYear {
  id: string;
  organization_id: string;
  name: string;
  start_date: string;
  end_date: string;
  status: 'draft' | 'open' | 'closed';
  is_current: boolean;
  created_at: string;
  created_by: string | null;
}

export interface FiscalPeriod {
  id: string;
  fiscal_year_id: string;
  organization_id: string;
  period_num: number;
  name: string;
  start_date: string;
  end_date: string;
  status: 'open' | 'closed';
  created_at: string;
}

export type AccountClassification = 'assets' | 'liabilities' | 'equity' | 'revenue' | 'expenses';
export type AccountNature = 'debit' | 'credit';

export interface Account {
  id: string;
  organization_id: string;
  code: string;
  name_ar: string;
  name_en: string | null;
  classification: AccountClassification;
  parent_id: string | null;
  level: number;
  nature: AccountNature;
  allow_direct_posting: boolean;
  is_active: boolean;
  is_system: boolean;
  description: string | null;
  created_at: string;
  updated_at: string;
  children?: Account[];
}

export interface AccountingSettings {
  id: string;
  organization_id: string;
  default_receivables_account_id: string | null;
  default_payables_account_id: string | null;
  default_cash_account_id: string | null;
  default_bank_account_id: string | null;
  default_sales_account_id: string | null;
  default_service_sales_account_id: string | null;
  default_tax_output_account_id: string | null;
  default_tax_input_account_id: string | null;
  default_cogs_account_id: string | null;
  default_inventory_account_id: string | null;
  default_retained_earnings_account_id: string | null;
  created_at: string;
  updated_at: string;
}

export type JournalEntryStatus = 'draft' | 'posted' | 'reversed';

export interface JournalEntry {
  id: string;
  organization_id: string;
  fiscal_year_id: string;
  fiscal_period_id: string;
  entry_number: string;
  entry_date: string;
  reference: string | null;
  description: string | null;
  source_type: 'manual' | 'system';
  source_id: string | null;
  status: JournalEntryStatus;
  posted_at: string | null;
  posted_by: string | null;
  reversed_entry_id: string | null;
  reversed_at: string | null;
  reversed_by: string | null;
  created_at: string;
  updated_at: string;
  created_by: string | null;
  lines?: JournalEntryLine[];
}

export interface JournalEntryLine {
  id: string;
  journal_entry_id: string;
  organization_id: string;
  account_id: string;
  line_number: number;
  description: string | null;
  debit: number;
  credit: number;
  created_at: string;
  account?: Account;
}

export type CustomerType = 'individual' | 'company' | 'government' | 'other';
export type OpeningBalanceType = 'debit' | 'credit';

export interface Customer {
  id: string;
  organization_id: string;
  code: string;
  name: string;
  display_name: string | null;
  customer_type: CustomerType;
  tax_number: string | null;
  commercial_registration: string | null;
  email: string | null;
  phone: string | null;
  mobile: string | null;
  city: string | null;
  address: string | null;
  opening_balance: number;
  opening_balance_type: OpeningBalanceType;
  receivable_account_id: string;
  is_active: boolean;
  notes: string | null;
  created_by: string | null;
  created_at: string;
  updated_at: string;
  receivable_account?: Account;
}

export type VendorType = 'individual' | 'company' | 'other';

export interface Vendor {
  id: string;
  organization_id: string;
  code: string;
  name: string;
  display_name: string | null;
  vendor_type: VendorType;
  tax_number: string | null;
  commercial_registration: string | null;
  email: string | null;
  phone: string | null;
  mobile: string | null;
  city: string | null;
  address: string | null;
  opening_balance: number;
  opening_balance_type: OpeningBalanceType;
  payable_account_id: string;
  is_active: boolean;
  notes: string | null;
  created_by: string | null;
  created_at: string;
  updated_at: string;
  payable_account?: Account;
}

export type ItemType = 'product' | 'service';

export interface Item {
  id: string;
  organization_id: string;
  item_type: ItemType;
  code: string;
  name: string;
  description: string | null;
  unit: string | null;
  sku: string | null;
  barcode: string | null;
  selling_price: number;
  purchase_price: number;
  tax_rate: number;
  sales_account_id: string | null;
  service_revenue_account_id: string | null;
  inventory_account_id: string | null;
  cogs_account_id: string | null;
  expense_account_id: string | null;
  is_stockable: boolean;
  is_active: boolean;
  created_by: string | null;
  created_at: string;
  updated_at: string;
  sales_account?: Account;
  service_revenue_account?: Account;
  inventory_account?: Account;
  cogs_account?: Account;
  expense_account?: Account;
}

// ==========================================
// Phase 5: Sales Invoices and Receipts (المبيعات والمتحصلات)
// ==========================================
export type SalesInvoiceStatus = 'draft' | 'approved' | 'cancelled';
export type PaymentStatus = 'unpaid' | 'partially_paid' | 'paid';

export interface SalesInvoice {
  id: string;
  organization_id: string;
  customer_id: string;
  invoice_number: string;
  invoice_date: string;
  due_date: string;
  status: SalesInvoiceStatus;
  payment_status: PaymentStatus;
  subtotal: number;
  discount_total: number;
  tax_total: number;
  total: number;
  paid_amount: number;
  balance_due: number;
  currency: string;
  notes: string | null;
  journal_entry_id: string | null;
  cancelled_journal_entry_id: string | null;
  approved_at: string | null;
  approved_by: string | null;
  cancelled_at: string | null;
  cancelled_by: string | null;
  created_by: string | null;
  created_at: string;
  updated_at: string;
  customer?: Customer;
  lines?: SalesInvoiceLine[];
}

export interface SalesInvoiceLine {
  id: string;
  sales_invoice_id: string;
  organization_id: string;
  item_id: string;
  line_number: number;
  description: string | null;
  quantity: number;
  unit_price: number;
  discount_amount: number;
  tax_rate: number;
  tax_amount: number;
  line_total: number;
  revenue_account_id: string;
  tax_account_id: string | null;
  created_at: string;
  item?: Item;
}

export type ReceiptStatus = 'draft' | 'approved' | 'cancelled';
export type PaymentMethod = 'cash' | 'bank_transfer' | 'card' | 'other';

export interface Receipt {
  id: string;
  organization_id: string;
  customer_id: string;
  receipt_number: string;
  receipt_date: string;
  amount: number;
  payment_method: PaymentMethod;
  cash_account_id: string | null;
  bank_account_id: string | null;
  reference: string | null;
  notes: string | null;
  status: ReceiptStatus;
  journal_entry_id: string | null;
  cancelled_journal_entry_id: string | null;
  created_by: string | null;
  created_at: string;
  updated_at: string;
  approved_at: string | null;
  approved_by: string | null;
  cancelled_at: string | null;
  cancelled_by: string | null;
  customer?: Customer;
  allocations?: ReceiptAllocation[];
}

export interface ReceiptAllocation {
  id: string;
  organization_id: string;
  receipt_id: string;
  sales_invoice_id: string;
  allocated_amount: number;
  created_at: string;
  sales_invoice?: SalesInvoice;
}


// ==========================================
// Phase 6: Purchase Bills and Payments (المشتريات والمدفوعات)
// ==========================================
export type PurchaseBillStatus = 'draft' | 'approved' | 'cancelled';

export interface PurchaseBill {
  id: string;
  organization_id: string;
  vendor_id: string;
  bill_number: string;
  vendor_invoice_number: string | null;
  bill_date: string;
  due_date: string;
  status: PurchaseBillStatus;
  payment_status: PaymentStatus;
  subtotal: number;
  discount_total: number;
  tax_total: number;
  total: number;
  paid_amount: number;
  balance_due: number;
  currency: string;
  notes: string | null;
  journal_entry_id: string | null;
  cancelled_journal_entry_id: string | null;
  approved_at: string | null;
  approved_by: string | null;
  cancelled_at: string | null;
  cancelled_by: string | null;
  created_by: string | null;
  created_at: string;
  updated_at: string;
  vendor?: Vendor;
  lines?: PurchaseBillLine[];
}

export interface PurchaseBillLine {
  id: string;
  purchase_bill_id: string;
  organization_id: string;
  item_id: string | null;
  line_number: number;
  description: string | null;
  quantity: number;
  unit_cost: number;
  discount_amount: number;
  tax_rate: number;
  tax_amount: number;
  line_total: number;
  expense_account_id: string | null;
  inventory_account_id: string | null;
  tax_account_id: string | null;
  created_at: string;
  item?: Item;
}

export type PaymentStatusType = 'draft' | 'approved' | 'cancelled';

export interface Payment {
  id: string;
  organization_id: string;
  vendor_id: string;
  payment_number: string;
  payment_date: string;
  amount: number;
  payment_method: PaymentMethod;
  cash_account_id: string | null;
  bank_account_id: string | null;
  reference: string | null;
  notes: string | null;
  status: PaymentStatusType;
  journal_entry_id: string | null;
  cancelled_journal_entry_id: string | null;
  created_by: string | null;
  created_at: string;
  updated_at?: string;
  approved_at: string | null;
  approved_by: string | null;
  cancelled_at: string | null;
  cancelled_by: string | null;
  vendor?: Vendor;
  allocations?: PaymentAllocation[];
}

export interface PaymentAllocation {
  id: string;
  organization_id: string;
  payment_id: string;
  purchase_bill_id: string;
  allocated_amount: number;
  created_at: string;
  purchase_bill?: PurchaseBill;
}

// ==========================================
// Phase 7: Basic Inventory and Movements
// ==========================================
export interface InventoryBalance {
  id: string;
  organization_id: string;
  item_id: string;
  quantity_on_hand: number;
  average_cost: number;
  inventory_value: number;
  last_movement_at: string;
  created_at: string;
  updated_at: string;
  item?: Item;
}

export type InventoryMovementType = 'purchase' | 'sale' | 'purchase_cancel' | 'sale_cancel' | 'adjustment';

export interface InventoryMovement {
  id: string;
  organization_id: string;
  item_id: string;
  movement_type: InventoryMovementType;
  movement_date: string;
  source_type: 'purchase_bill' | 'sales_invoice' | 'manual_adjustment';
  source_id: string;
  quantity_in: number;
  quantity_out: number;
  unit_cost: number;
  total_cost: number;
  quantity_after: number;
  average_cost_after: number;
  notes: string | null;
  created_by: string | null;
  created_at: string;
  item?: Item;
}






