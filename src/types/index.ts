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
  default_tax_rate?: number;
  website?: string | null;
  address_line?: string | null;
  country?: string | null;
  postal_code?: string | null;
  print_primary_color?: string | null;
  print_footer_text?: string | null;
  default_invoice_note?: string | null;
  default_receipt_note?: string | null;
  default_payment_note?: string | null;
  show_logo_on_print?: boolean;
  show_tax_number_on_print?: boolean;
  show_commercial_registration_on_print?: boolean;
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
  country_code?: string;
  currency_code?: string;
  default_tax_rate?: number;
  primary_language?: string;
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
  name_ar?: string | null;
  name_en?: string | null;
  start_date: string;
  end_date: string;
  status: 'draft' | 'open' | 'closed' | 'locked';
  is_current: boolean;
  closed_at?: string | null;
  closed_by?: string | null;
  closing_entry_id?: string | null;
  close_notes?: string | null;
  updated_at?: string | null;
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
  status: 'open' | 'closed' | 'locked';
  closed_at?: string | null;
  closed_by?: string | null;
  locked_reason?: string | null;
  updated_at?: string | null;
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
  balance_sheet_section: 'current_asset' | 'non_current_asset' | 'current_liability' | 'non_current_liability' | 'equity' | null;
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
  fiscal_year_name?: string | null;
  fiscal_period_name?: string | null;
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
// Phase 5: Sales Invoices, Quotations and Receipts (المبيعات والعروض والمتحصلات)
// ==========================================
export type SalesInvoiceStatus = 'draft' | 'approved' | 'cancelled';
export type PaymentStatus = 'unpaid' | 'partially_paid' | 'paid';

export type InvoicePaymentMethod = 
  | 'cash' 
  | 'credit' 
  | 'card' 
  | 'cheque' 
  | 'bank_transfer' 
  | 'cash_and_card' 
  | 'bank_transfer_and_cash';

export interface ChequeDetails {
  cheque_number?: string;
  cheque_bank_name?: string;
  cheque_date?: string;
  cheque_status?: 'received' | 'under_collection' | 'cleared' | 'bounced';
}

export interface PaymentDetails extends ChequeDetails {
  cash_account_id?: string;
  bank_account_id?: string;
  card_account_id?: string;
  cash_amount?: number;
  card_amount?: number;
  bank_transfer_amount?: number;
  card_reference?: string;
  bank_reference?: string;
}

export interface SalesInvoice {
  id: string;
  organization_id: string;
  customer_id: string;
  invoice_number: string;
  invoice_date: string;
  due_date: string;
  status: SalesInvoiceStatus;
  payment_status: PaymentStatus;
  prices_include_tax: boolean;
  payment_method: InvoicePaymentMethod;
  payment_reference: string | null;
  payment_notes: string | null;
  payment_details: PaymentDetails;
  source_quotation_id?: string | null;
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
  deleted_at?: string | null;
  deleted_by?: string | null;
  delete_reason?: string | null;
  restored_at?: string | null;
  restored_by?: string | null;
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
  entered_unit_price?: number | null;
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
  cash_bank_account_id: string | null;
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
  deleted_at?: string | null;
  deleted_by?: string | null;
  delete_reason?: string | null;
  restored_at?: string | null;
  restored_by?: string | null;
  customer?: Customer;
  allocations?: ReceiptAllocation[];
  cash_bank_account?: CashBankAccount;
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

export type SalesCreditNoteStatus = 'draft' | 'approved' | 'cancelled';

export interface SalesCreditNote {
  id: string;
  organization_id: string;
  original_invoice_id: string;
  customer_id: string;
  credit_note_number: string;
  credit_note_date: string;
  status: SalesCreditNoteStatus;
  subtotal: number;
  tax_amount: number;
  total_amount: number;
  currency_code: string;
  reason: string | null;
  notes: string | null;
  journal_entry_id: string | null;
  cogs_journal_entry_id: string | null;
  created_by: string | null;
  approved_by: string | null;
  approved_at: string | null;
  cancelled_by: string | null;
  cancelled_at: string | null;
  cancel_reason: string | null;
  created_at: string;
  updated_at: string;
  deleted_at?: string | null;
  deleted_by?: string | null;
  delete_reason?: string | null;
  restored_at?: string | null;
  restored_by?: string | null;
  customer?: Customer;
  original_invoice?: SalesInvoice;
  lines?: SalesCreditNoteLine[];
}

export interface SalesCreditNoteLine {
  id: string;
  organization_id: string;
  credit_note_id: string;
  original_invoice_line_id: string;
  item_id: string | null;
  description: string;
  quantity: number;
  unit_price: number;
  tax_rate: number;
  subtotal: number;
  tax_amount: number;
  total_amount: number;
  created_at: string;
  item?: Item;
}

export type PurchaseDebitNoteStatus = 'draft' | 'approved' | 'cancelled';

export interface PurchaseDebitNote {
  id: string;
  organization_id: string;
  original_bill_id: string;
  vendor_id: string;
  debit_note_number: string;
  debit_note_date: string;
  status: PurchaseDebitNoteStatus;
  subtotal: number;
  tax_amount: number;
  total_amount: number;
  currency_code: string;
  reason: string | null;
  notes: string | null;
  journal_entry_id: string | null;
  created_by: string | null;
  approved_by: string | null;
  approved_at: string | null;
  cancelled_by: string | null;
  cancelled_at: string | null;
  cancel_reason: string | null;
  created_at: string;
  updated_at: string;
  deleted_at?: string | null;
  deleted_by?: string | null;
  delete_reason?: string | null;
  restored_at?: string | null;
  restored_by?: string | null;
  vendor?: Vendor;
  original_bill?: PurchaseBill;
  lines?: PurchaseDebitNoteLine[];
}

export interface PurchaseDebitNoteLine {
  id: string;
  organization_id: string;
  debit_note_id: string;
  original_bill_line_id: string;
  item_id: string | null;
  description: string;
  quantity: number;
  unit_price: number;
  tax_rate: number;
  subtotal: number;
  tax_amount: number;
  total_amount: number;
  created_at: string;
  item?: Item;
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
  prices_include_tax: boolean;
  payment_method: InvoicePaymentMethod;
  payment_reference: string | null;
  payment_notes: string | null;
  payment_details: PaymentDetails;
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
  deleted_at?: string | null;
  deleted_by?: string | null;
  delete_reason?: string | null;
  restored_at?: string | null;
  restored_by?: string | null;
  vendor?: Vendor;
  lines?: PurchaseBillLine[];
}

// ==========================================
// Sales Quotations (عروض الأسعار)
// ==========================================
export type QuotationStatus = 'draft' | 'sent' | 'accepted' | 'rejected' | 'expired' | 'converted' | 'cancelled';

export interface SalesQuotation {
  id: string;
  organization_id: string;
  quotation_number: string;
  customer_id: string;
  quotation_date: string;
  valid_until: string | null;
  status: QuotationStatus;
  prices_include_tax: boolean;
  payment_method: InvoicePaymentMethod;
  payment_reference: string | null;
  payment_notes: string | null;
  payment_details: PaymentDetails;
  subtotal: number;
  discount_total: number;
  tax_total: number;
  total: number;
  currency: string;
  notes: string | null;
  terms_and_conditions: string | null;
  converted_invoice_id: string | null;
  created_by: string | null;
  created_at: string;
  updated_at: string;
  deleted_at?: string | null;
  deleted_by?: string | null;
  delete_reason?: string | null;
  restored_at?: string | null;
  restored_by?: string | null;
  customer?: Customer;
  lines?: SalesQuotationLine[];
}

export interface SalesQuotationLine {
  id: string;
  organization_id: string;
  sales_quotation_id: string;
  item_id: string | null;
  line_number: number;
  description: string | null;
  quantity: number;
  unit_price: number;
  entered_unit_price?: number | null;
  discount_amount: number;
  tax_rate: number;
  tax_amount: number;
  line_total: number;
  revenue_account_id?: string | null;
  created_at: string;
  item?: Item;
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
  entered_unit_cost?: number | null;
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
  cash_bank_account_id: string | null;
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
  deleted_at?: string | null;
  deleted_by?: string | null;
  delete_reason?: string | null;
  restored_at?: string | null;
  restored_by?: string | null;
  vendor?: Vendor;
  allocations?: PaymentAllocation[];
  cash_bank_account?: CashBankAccount;
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

export interface ZatcaSettings {
  id: string;
  organization_id: string;
  is_enabled: boolean;
  seller_name: string | null;
  seller_vat_number: string | null;
  seller_commercial_registration: string | null;
  seller_address: string | null;
  seller_city: string | null;
  seller_postal_code: string | null;
  seller_country: string;
  invoice_type_default: 'simplified' | 'standard';
  environment: 'sandbox' | 'simulation' | 'production';
  created_at: string;
  updated_at: string;
}

export interface EInvoiceArtifact {
  id: string;
  organization_id: string;
  sales_invoice_id: string;
  invoice_number: string;
  invoice_type: 'simplified' | 'standard';
  qr_tlv_base64: string | null;
  xml_content: string | null;
  xml_hash: string | null;
  generation_status: 'draft' | 'qr_generated' | 'xml_generated' | 'invalid';
  validation_errors: any[];
  generated_at: string;
  created_at: string;
  updated_at: string;
  sdk_validation_status?: 'not_checked' | 'ready_for_check' | 'passed' | 'failed' | 'needs_review';
  sdk_validation_errors?: any[];
  sdk_validation_summary?: string | null;
  sdk_validated_at?: string | null;
  sdk_validated_by?: string | null;
  sdk_tool_version?: string | null;
  sdk_raw_result?: string | null;
}

export type ZatcaEnvironment = 'sandbox' | 'simulation' | 'production';
export type ZatcaProfileStatus = 'not_configured' | 'csr_metadata_ready' | 'csr_created_external' | 'csid_added' | 'ready_for_integration';
export type ZatcaPrivateKeyStorageMode = 'not_stored' | 'external_secret_manager' | 'edge_function_secret_reference';

export interface ZatcaSigningProfile {
  id: string;
  organization_id: string;
  environment: ZatcaEnvironment;
  profile_status: ZatcaProfileStatus;

  csr_common_name: string | null;
  csr_serial_number: string | null;
  csr_organization_identifier: string | null;
  csr_organization_unit_name: string | null;
  csr_organization_name: string | null;
  csr_country_name: string;
  csr_invoice_type: string | null;
  csr_location: string | null;
  csr_industry: string | null;

  csr_pem: string | null;
  certificate_pem: string | null;
  csid_value: string | null;
  csid_type: 'compliance' | 'production' | null;
  certificate_subject: string | null;
  certificate_issuer: string | null;
  certificate_valid_from: string | null;
  certificate_valid_to: string | null;

  private_key_storage_mode: ZatcaPrivateKeyStorageMode;
  private_key_secret_reference: string | null;

  notes: string | null;
  created_at: string;
  updated_at: string;
}

export type CashBankAccountType = 'cash' | 'bank';

export interface CashBankAccount {
  id: string;
  organization_id: string;
  account_id: string;
  type: CashBankAccountType;
  name: string;
  bank_name: string | null;
  iban: string | null;
  account_number: string | null;
  currency_code: string;
  opening_balance: number;
  current_balance: number;
  is_default: boolean;
  is_active: boolean;
  notes: string | null;
  created_by?: string | null;
  created_at: string;
  updated_at: string;
  // Join fields
  account_code?: string;
  account_name_ar?: string;
  account_name_en?: string | null;
}

export interface CreateCashBankAccountInput {
  organization_id: string;
  account_id: string;
  type: CashBankAccountType;
  name: string;
  bank_name?: string | null;
  iban?: string | null;
  account_number?: string | null;
  opening_balance?: number;
  is_default?: boolean;
  notes?: string | null;
}

export interface UpdateCashBankAccountInput {
  id: string;
  name: string;
  bank_name?: string | null;
  iban?: string | null;
  account_number?: string | null;
  is_default?: boolean;
  notes?: string | null;
  is_active?: boolean;
}

export type CashBankTransferStatus = 'draft' | 'approved' | 'cancelled';

export interface CashBankTransfer {
  id: string;
  transfer_number: string;
  transfer_date: string;
  from_cash_bank_account_id: string;
  from_account_name: string;
  from_account_type: 'cash' | 'bank';
  from_bank_name: string | null;
  to_cash_bank_account_id: string;
  to_account_name: string;
  to_account_type: 'cash' | 'bank';
  to_bank_name: string | null;
  amount: number;
  currency_code: string;
  description: string | null;
  reference_number: string | null;
  status: CashBankTransferStatus;
  journal_entry_id: string | null;
  approved_by: string | null;
  approved_at: string | null;
  cancelled_by: string | null;
  cancelled_at: string | null;
  cancel_reason: string | null;
  created_by: string | null;
  created_at: string;
  updated_at: string;
}

export interface CreateCashBankTransferInput {
  organization_id: string;
  transfer_date: string;
  from_cash_bank_account_id: string;
  to_cash_bank_account_id: string;
  amount: number;
  description?: string | null;
  reference_number?: string | null;
}

// ==========================================
// Phase 13: Inventory Adjustments & Stock Count
// ==========================================
export type InventoryAdjustmentType = 'increase' | 'decrease' | 'stock_count';
export type InventoryAdjustmentStatus = 'draft' | 'approved' | 'cancelled';

export interface InventoryAdjustment {
  id: string;
  organization_id: string;
  adjustment_number: string;
  adjustment_date: string;
  adjustment_type: InventoryAdjustmentType;
  reason: string;
  status: InventoryAdjustmentStatus;
  total_amount: number;
  currency_code: string;
  notes: string | null;
  journal_entry_id: string | null;
  created_by: string | null;
  approved_by: string | null;
  approved_at: string | null;
  cancelled_by: string | null;
  cancelled_at: string | null;
  cancel_reason: string | null;
  created_at: string;
  updated_at: string;
  lines?: InventoryAdjustmentLine[];
}

export interface InventoryAdjustmentLine {
  id: string;
  adjustment_id: string;
  item_id: string;
  system_quantity: number;
  actual_quantity: number | null;
  adjustment_quantity: number;
  unit_cost: number;
  total_cost: number;
  notes: string | null;
  created_at: string;
  item?: Item;
}

// ==========================================
// Phase 14: Bank Reconciliation (مطابقة الحسابات البنكية)
// ==========================================
export type BankReconciliationStatus = 'draft' | 'completed' | 'cancelled';
export type BankReconciliationSourceType = 'receipt' | 'payment' | 'transfer' | 'journal_entry';
export type BankReconciliationAdjustmentType = 'bank_fee' | 'bank_interest' | 'transfer_charge' | 'rounding_difference' | 'other';

export interface BankReconciliation {
  id: string;
  organization_id: string;
  cash_bank_account_id: string;
  account_name: string;
  account_type: 'cash' | 'bank';
  currency_code?: string;
  reconciliation_date: string;
  book_balance: number;
  statement_balance: number;
  difference: number;
  status: BankReconciliationStatus;
  notes: string | null;
  matched_count?: number;
  unmatched_count?: number;
  created_at: string;
  created_by_name?: string | null;
  completed_at?: string | null;
  completed_by_name?: string | null;
  cancelled_at?: string | null;
  cancelled_by_name?: string | null;
  cancel_reason?: string | null;
  adjustment_journal_entry_id?: string | null;
}

export interface BankReconciliationLine {
  id: string;
  reconciliation_id: string;
  source_type: BankReconciliationSourceType;
  source_id: string;
  transaction_date: string;
  description: string;
  debit_amount: number;
  credit_amount: number;
  amount: number;
  is_matched: boolean;
  matched_at: string | null;
  notes: string | null;
}

export interface BankReconciliationAdjustment {
  id: string;
  reconciliation_id: string;
  organization_id: string;
  adjustment_type: BankReconciliationAdjustmentType;
  description: string;
  account_id: string;
  debit_amount: number;
  credit_amount: number;
  amount: number;
  notes: string | null;
  created_by?: string | null;
  created_at: string;
  updated_at: string;
  account_code?: string;
  account_name_ar?: string;
  account_name_en?: string | null;
}




