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

