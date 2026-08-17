import { supabase } from './supabase';

export interface PlatformOrganizationRow {
  organization_id: string;
  organization_name: string;
  owner_name: string;
  owner_email: string;
  owner_phone: string;
  created_at: string;
  subscription_status: 'trial' | 'active' | 'past_due' | 'suspended' | 'cancelled';
  plan_name: string;
  trial_ends_at: string | null;
  ends_at: string | null;
  users_count: number;
  invoices_count: number;
}

export interface PlatformOrganizationDetails {
  organization_id: string;
  organization_name_ar: string | null;
  organization_name_en: string | null;
  cr_number: string | null;
  vat_number: string | null;
  city: string | null;
  phone: string | null;
  email: string | null;
  created_at: string;
  owner_name: string;
  owner_email: string;
  owner_phone: string;
  subscription_id: string | null;
  plan_id: string | null;
  plan_code: string | null;
  plan_name_ar: string | null;
  subscription_status: 'trial' | 'active' | 'past_due' | 'suspended' | 'cancelled';
  billing_cycle: 'monthly' | 'yearly' | 'manual';
  starts_at: string | null;
  ends_at: string | null;
  trial_ends_at: string | null;
  manual_activation_reason: string | null;
  internal_notes: string | null;
  activated_at: string | null;
  suspended_at: string | null;
}

export interface SubscriptionPlan {
  id: string;
  code: string;
  name_ar: string;
  name_en: string | null;
  description_ar: string | null;
  description_en: string | null;
  plan_type: 'paid' | 'free' | 'trial';
  billing_interval: 'monthly' | 'yearly' | 'custom' | 'none';
  duration_days: number | null;
  price: number;
  currency_code: string;
  trial_days: number | null;
  max_users: number | null;
  max_branches: number | null;
  max_invoices_per_month: number | null;
  features: any;
  is_active: boolean;
  is_public: boolean;
  is_default_trial: boolean;
  sort_order: number;
  archived_at: string | null;
  active_subscriptions_count?: number;
}

export interface SubscriptionEvent {
  id: string;
  organization_id: string;
  subscription_id: string | null;
  event_type: 'created' | 'plan_changed' | 'activated' | 'suspended' | 'cancelled' | 'trial_extended' | 'note_added';
  old_status: string | null;
  new_status: string | null;
  note: string | null;
  created_at: string;
}

export interface ClientSubscriptionInfo {
  id: string;
  organization_id: string;
  plan_id: string;
  status: string;
  starts_at: string | null;
  ends_at: string | null;
  trial_starts_at: string | null;
  trial_ends_at: string | null;
  grace_ends_at: string | null;
  auto_renew: boolean;
  activation_method: string;
  price_snapshot: number;
  currency_snapshot: string;
  plan_name_snapshot: string;
  duration_days_snapshot: number | null;
  created_at: string;
  billing_cycle?: string | null;
  plan: {
    code: string;
    name_ar: string;
    name_en: string | null;
    features: any;
    max_users: number | null;
    max_branches?: number | null;
    max_invoices_per_month?: number | null;
  } | null;
  effective_status: string;
  days_remaining: number;
}

export const platformService = {
  /**
   * Check if the current user is a platform admin
   */
  async isPlatformAdmin(): Promise<boolean> {
    try {
      const { data, error } = await supabase.rpc('is_platform_admin');
      if (error) {
        console.error('Failed to verify platform admin status:', error);
        return false;
      }
      return !!data;
    } catch (err) {
      console.error('Error verifying platform admin status:', err);
      return false;
    }
  },

  /**
   * List all platform organizations (Super Admin only)
   */
  async listOrganizations(): Promise<PlatformOrganizationRow[]> {
    const { data, error } = await supabase.rpc('platform_list_organizations');
    if (error) {
      throw error;
    }
    return data || [];
  },

  /**
   * Get detail information for a single organization (Super Admin only)
   */
  async getOrganizationDetails(orgId: string): Promise<PlatformOrganizationDetails> {
    const { data, error } = await supabase.rpc('platform_get_organization_details', { p_org_id: orgId });
    if (error) {
      throw error;
    }
    if (!data || data.length === 0) {
      throw new Error('لم يتم العثور على تفاصيل المنشأة المحددة.');
    }
    return data[0];
  },

  /**
   * Update subscription manually (Super Admin only)
   */
  async updateSubscription(params: {
    organizationId: string;
    planId: string;
    status: 'trial' | 'active' | 'past_due' | 'suspended' | 'cancelled';
    billingCycle: 'monthly' | 'yearly' | 'manual';
    startsAt: string | null;
    endsAt: string | null;
    trialEndsAt: string | null;
    note: string;
  }): Promise<void> {
    const { error } = await supabase.rpc('platform_update_subscription', {
      p_org_id: params.organizationId,
      p_plan_id: params.planId,
      p_status: params.status,
      p_billing_cycle: params.billingCycle,
      p_starts_at: params.startsAt,
      p_ends_at: params.endsAt,
      p_trial_ends_at: params.trialEndsAt,
      p_note: params.note,
    });
    if (error) {
      throw error;
    }
  },

  /**
   * Add manual log/note to a subscription (Super Admin only)
   */
  async addSubscriptionNote(orgId: string, note: string): Promise<void> {
    const { error } = await supabase.rpc('platform_add_subscription_note', {
      p_org_id: orgId,
      p_note: note,
    });
    if (error) {
      throw error;
    }
  },

  /**
   * List all subscription plans
   */
  async getSubscriptionPlans(): Promise<SubscriptionPlan[]> {
    const { data, error } = await supabase
      .from('subscription_plans')
      .select('*')
      .order('sort_order', { ascending: true });
    if (error) {
      throw error;
    }
    return data || [];
  },

  /**
   * Get subscription events history for an organization (Super Admin only)
   */
  async getSubscriptionEvents(orgId: string): Promise<SubscriptionEvent[]> {
    const { data, error } = await supabase.rpc('platform_list_subscription_events', {
      p_org_id: orgId
    });
    if (error) {
      throw error;
    }
    return data || [];
  },

  /**
   * Get subscription for current organization (Organization members)
   */
  async getOrganizationSubscription(orgId: string): Promise<ClientSubscriptionInfo | null> {
    try {
      let { data, error } = await supabase.rpc('get_current_organization_subscription', {
        p_org_id: orgId
      });

      if (error) {
        console.warn('Error fetching subscription:', error);
        throw error;
      }

      // If no subscription row exists, try to ensure/create one
      if (!data || data.length === 0) {
        await supabase.rpc('ensure_organization_trial_subscription', { p_org_id: orgId });
        
        // Re-fetch
        const refetch = await supabase.rpc('get_current_organization_subscription', {
          p_org_id: orgId
        });
        if (!refetch.error && refetch.data && refetch.data.length > 0) {
          data = refetch.data;
        }
      }

      if (!data || data.length === 0) {
        // Return a legacy pending fallback as required
        return {
          id: 'legacy-id-' + orgId,
          organization_id: orgId,
          plan_id: '',
          status: 'legacy_pending',
          starts_at: new Date().toISOString(),
          ends_at: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString(),
          trial_starts_at: null,
          trial_ends_at: null,
          grace_ends_at: null,
          auto_renew: false,
          activation_method: 'migration',
          price_snapshot: 0,
          currency_snapshot: 'SAR',
          plan_name_snapshot: 'رتبة معلقة (Legacy)',
          duration_days_snapshot: null,
          created_at: new Date().toISOString(),
          plan: {
            code: 'legacy_pending',
            name_ar: 'منشأة قديمة (معلقة)',
            name_en: 'Legacy Pending',
            features: {
              zatca: true,
              inventory: true,
              reports: true
            },
            max_users: null
          },
          effective_status: 'legacy_pending',
          days_remaining: 30
        };
      }

      const result = data[0];
      return {
        id: result.subscription_id,
        organization_id: result.organization_id,
        plan_id: result.plan_id,
        status: result.status,
        starts_at: result.starts_at,
        ends_at: result.ends_at,
        trial_starts_at: result.trial_starts_at,
        trial_ends_at: result.trial_ends_at,
        grace_ends_at: result.grace_ends_at,
        auto_renew: result.auto_renew,
        activation_method: result.activation_method,
        price_snapshot: Number(result.price_snapshot || 0),
        currency_snapshot: result.currency_snapshot || 'SAR',
        plan_name_snapshot: result.plan_name_snapshot || '',
        duration_days_snapshot: result.duration_days_snapshot,
        created_at: result.created_at || new Date().toISOString(),
        plan: result.plan_code ? {
          code: result.plan_code,
          name_ar: result.plan_name_ar,
          name_en: result.plan_name_en,
          features: result.plan_features || {},
          max_users: result.max_users
        } : null,
        effective_status: result.effective_status,
        days_remaining: result.days_remaining || 0
      };
    } catch (err: any) {
      console.warn('Error in getOrganizationSubscription:', err);
      // Fail safely to legacy_pending state
      return {
        id: 'legacy-fail-id-' + orgId,
        organization_id: orgId,
        plan_id: '',
        status: 'legacy_pending',
        starts_at: new Date().toISOString(),
        ends_at: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString(),
        trial_starts_at: null,
        trial_ends_at: null,
        grace_ends_at: null,
        auto_renew: false,
        activation_method: 'migration',
        price_snapshot: 0,
        currency_snapshot: 'SAR',
        plan_name_snapshot: 'رتبة معلقة (Legacy)',
        duration_days_snapshot: null,
        created_at: new Date().toISOString(),
        plan: {
          code: 'legacy_pending',
          name_ar: 'منشأة قديمة (معلقة)',
          name_en: 'Legacy Pending',
          features: {
            zatca: true,
            inventory: true,
            reports: true
          },
          max_users: null
        },
        effective_status: 'legacy_pending',
        days_remaining: 30
      };
    }
  },

  /**
   * Get role of active platform admin
   */
  async getPlatformAdminRole(): Promise<string | null> {
    const { data, error } = await supabase.rpc('get_platform_admin_role');
    if (error) {
      console.error('Failed to get platform admin role:', error);
      return null;
    }
    return data;
  },

  /**
   * Get overall platform dashboard stats
   */
  async getDashboardStats(): Promise<PlatformDashboardStats> {
    const { data, error } = await supabase.rpc('platform_get_dashboard_stats');
    if (error) {
      throw error;
    }
    return data;
  },

  /**
   * List all system users with their linked organizations
   */
  async listUsers(): Promise<PlatformUserRow[]> {
    const { data, error } = await supabase.rpc('platform_list_users');
    if (error) {
      throw error;
    }
    return data || [];
  },

  /**
   * Get members of a specific organization
   */
  async getOrgMembers(orgId: string): Promise<PlatformOrgMemberRow[]> {
    const { data, error } = await supabase.rpc('platform_get_org_members', { p_org_id: orgId });
    if (error) {
      throw error;
    }
    return data || [];
  },

  /**
   * Fetch read-only documents using unified platform list organization documents RPC
   */
  async listOrgDocuments(orgId: string, type: string): Promise<any[]> {
    const { data, error } = await supabase.rpc('platform_list_organization_documents', {
      p_org_id: orgId,
      p_document_type: type
    });
    if (error) {
      console.error('Unified document fetch error details:', {
        organizationId: orgId,
        documentType: type,
        rpcName: 'platform_list_organization_documents',
        error
      });
      throw error;
    }

    // Ensure full compatibility with rendering properties in AdminDashboard.tsx
    return (data || []).map((doc: any) => {
      const mapped: any = {
        ...doc,
        currency: doc.currency_code,
        total: doc.amount,
        amount: doc.amount
      };

      if (type === 'sales_invoice') {
        mapped.invoice_number = doc.document_number;
        mapped.invoice_date = doc.document_date;
      } else if (type === 'purchase_bill') {
        mapped.bill_number = doc.document_number;
        mapped.bill_date = doc.document_date;
      } else if (type === 'receipt') {
        mapped.receipt_number = doc.document_number;
        mapped.receipt_date = doc.document_date;
      } else if (type === 'payment') {
        mapped.payment_number = doc.document_number;
        mapped.payment_date = doc.document_date;
      } else if (type === 'credit_note') {
        mapped.note_number = doc.document_number;
        mapped.note_date = doc.document_date;
      } else if (type === 'debit_note') {
        mapped.note_number = doc.document_number;
        mapped.note_date = doc.document_date;
      } else if (type === 'journal_entry') {
        mapped.entry_number = doc.document_number;
        mapped.entry_date = doc.document_date;
      }

      return mapped;
    });
  },

  /**
   * Get sales invoices for an organization (read-only)
   */
  async listOrgSalesInvoices(orgId: string): Promise<any[]> {
    return this.listOrgDocuments(orgId, 'sales_invoice');
  },

  /**
   * Get purchase bills for an organization (read-only)
   */
  async listOrgPurchaseBills(orgId: string): Promise<any[]> {
    return this.listOrgDocuments(orgId, 'purchase_bill');
  },

  /**
   * Get receipts for an organization (read-only)
   */
  async listOrgReceipts(orgId: string): Promise<any[]> {
    return this.listOrgDocuments(orgId, 'receipt');
  },

  /**
   * Get payments for an organization (read-only)
   */
  async listOrgPayments(orgId: string): Promise<any[]> {
    return this.listOrgDocuments(orgId, 'payment');
  },

  /**
   * Get credit notes for an organization (read-only)
   */
  async listOrgCreditNotes(orgId: string): Promise<any[]> {
    return this.listOrgDocuments(orgId, 'credit_note');
  },

  /**
   * Get debit notes for an organization (read-only)
   */
  async listOrgDebitNotes(orgId: string): Promise<any[]> {
    return this.listOrgDocuments(orgId, 'debit_note');
  },

  /**
   * Get journal entries for an organization (read-only)
   */
  async listOrgJournalEntries(orgId: string): Promise<any[]> {
    return this.listOrgDocuments(orgId, 'journal_entry');
  },

  /**
   * List all soft-deleted documents across organizations
   */
  async listDeletedDocuments(): Promise<PlatformDeletedDocumentRow[]> {
    const { data, error } = await supabase.rpc('platform_list_deleted_documents');
    if (error) {
      console.error('Failed fetching deleted docs details:', {
        rpcName: 'platform_list_deleted_documents',
        error
      });
      throw error;
    }
    // Map backend standard attributes to frontend properties for maximum backward compatibility
    return (data || []).map((doc: any) => ({
      ...doc,
      status: doc.document_status || doc.status,
      currency: doc.currency_code || doc.currency
    }));
  },

  /**
   * Restore a soft-deleted draft document (Super Admin or Platform Admin only, support excluded)
   */
  async restoreDocument(documentType: string, documentId: string): Promise<void> {
    const { error } = await supabase.rpc('platform_restore_deleted_document', {
      p_document_type: documentType,
      p_document_id: documentId
    });
    if (error) {
      console.error('Failed restoring document details:', {
        rpcName: 'platform_restore_deleted_document',
        error,
        documentType,
        documentId
      });
      throw error;
    }
  },

  /**
   * List all subscription plans, including archived ones (Super Admin only)
   */
  async listPlansAdmin(): Promise<SubscriptionPlan[]> {
    const { data, error } = await supabase.rpc('platform_list_subscription_plans');
    if (error) {
      throw error;
    }
    return data || [];
  },

  /**
   * Create a new subscription plan (Super Admin only)
   */
  async createPlan(params: {
    code: string;
    nameAr: string;
    nameEn: string | null;
    descriptionAr: string | null;
    descriptionEn: string | null;
    planType: 'paid' | 'free' | 'trial';
    billingInterval: 'monthly' | 'yearly' | 'custom' | 'none';
    durationDays: number | null;
    price: number;
    currencyCode: string;
    trialDays: number | null;
    maxUsers: number | null;
    maxBranches: number | null;
    maxInvoicesPerMonth: number | null;
    features: any;
    isActive: boolean;
    isPublic: boolean;
    isDefaultTrial: boolean;
    sortOrder: number;
  }): Promise<string> {
    const { data, error } = await supabase.rpc('platform_create_subscription_plan', {
      p_code: params.code,
      p_name_ar: params.nameAr,
      p_name_en: params.nameEn,
      p_description_ar: params.descriptionAr,
      p_description_en: params.descriptionEn,
      p_plan_type: params.planType,
      p_billing_interval: params.billingInterval,
      p_duration_days: params.durationDays,
      p_price: params.price,
      p_currency_code: params.currencyCode,
      p_trial_days: params.trialDays,
      p_max_users: params.maxUsers,
      p_max_branches: params.maxBranches,
      p_max_invoices_per_month: params.maxInvoicesPerMonth,
      p_features: params.features,
      p_is_active: params.isActive,
      p_is_public: params.isPublic,
      p_is_default_trial: params.isDefaultTrial,
      p_sort_order: params.sortOrder
    });
    if (error) {
      throw error;
    }
    return data;
  },

  /**
   * Update an existing subscription plan (Super Admin only)
   */
  async updatePlan(planId: string, params: {
    code: string;
    nameAr: string;
    nameEn: string | null;
    descriptionAr: string | null;
    descriptionEn: string | null;
    planType: 'paid' | 'free' | 'trial';
    billingInterval: 'monthly' | 'yearly' | 'custom' | 'none';
    durationDays: number | null;
    price: number;
    currencyCode: string;
    trialDays: number | null;
    maxUsers: number | null;
    maxBranches: number | null;
    maxInvoicesPerMonth: number | null;
    features: any;
    isActive: boolean;
    isPublic: boolean;
    isDefaultTrial: boolean;
    sortOrder: number;
  }): Promise<void> {
    const { error } = await supabase.rpc('platform_update_subscription_plan', {
      p_id: planId,
      p_code: params.code,
      p_name_ar: params.nameAr,
      p_name_en: params.nameEn,
      p_description_ar: params.descriptionAr,
      p_description_en: params.descriptionEn,
      p_plan_type: params.planType,
      p_billing_interval: params.billingInterval,
      p_duration_days: params.durationDays,
      p_price: params.price,
      p_currency_code: params.currencyCode,
      p_trial_days: params.trialDays,
      p_max_users: params.maxUsers,
      p_max_branches: params.maxBranches,
      p_max_invoices_per_month: params.maxInvoicesPerMonth,
      p_features: params.features,
      p_is_active: params.isActive,
      p_is_public: params.isPublic,
      p_is_default_trial: params.isDefaultTrial,
      p_sort_order: params.sortOrder
    });
    if (error) {
      throw error;
    }
  },

  /**
   * Archive a subscription plan (Super Admin only)
   */
  async archivePlan(planId: string): Promise<void> {
    const { error } = await supabase.rpc('platform_archive_subscription_plan', {
      p_id: planId
    });
    if (error) {
      throw error;
    }
  },

  /**
   * Restore an archived subscription plan (Super Admin only)
   */
  async restorePlan(planId: string): Promise<void> {
    const { error } = await supabase.rpc('platform_restore_subscription_plan', {
      p_id: planId
    });
    if (error) {
      throw error;
    }
  },

  /**
   * List all organization subscriptions with filtering options (Super Admin only)
   */
  async listOrgSubscriptionsAdmin(params?: {
    search?: string;
    statusFilter?: string;
    planFilter?: string;
  }): Promise<any[]> {
    const { data, error } = await supabase.rpc('platform_list_organization_subscriptions', {
      p_search: params?.search || null,
      p_status_filter: params?.statusFilter || null,
      p_plan_filter: params?.planFilter || null
    });
    if (error) {
      throw error;
    }
    return data || [];
  },

  /**
   * Activate or override an organization's subscription (Super Admin only)
   */
  async activateOrgSubscription(params: {
    orgId: string;
    planId: string;
    startsAt: string;
    endsAt: string;
    graceDays?: number;
    priceSnapshot?: number;
    notes?: string;
  }): Promise<string> {
    const { data, error } = await supabase.rpc('platform_activate_organization_subscription', {
      p_org_id: params.orgId,
      p_plan_id: params.planId,
      p_starts_at: params.startsAt,
      p_ends_at: params.endsAt,
      p_grace_days: params.graceDays ?? 0,
      p_price_snapshot: params.priceSnapshot ?? null,
      p_notes: params.notes || null
    });
    if (error) {
      throw error;
    }
    return data;
  },

  /**
   * Extend the current active organization's subscription (Super Admin only)
   */
  async extendOrgSubscription(params: {
    orgId: string;
    endsAt: string;
    graceDays?: number;
    notes?: string;
  }): Promise<void> {
    const { error } = await supabase.rpc('platform_extend_organization_subscription', {
      p_org_id: params.orgId,
      p_ends_at: params.endsAt,
      p_grace_days: params.graceDays ?? 0,
      p_notes: params.notes || null
    });
    if (error) {
      throw error;
    }
  },

  /**
   * Change plan for an organization's subscription (Super Admin only)
   */
  async changeOrgPlan(params: {
    orgId: string;
    planId: string;
    endsAt: string;
    graceDays?: number;
    priceSnapshot?: number;
    notes?: string;
  }): Promise<void> {
    const { error } = await supabase.rpc('platform_change_organization_plan', {
      p_org_id: params.orgId,
      p_plan_id: params.planId,
      p_ends_at: params.endsAt,
      p_grace_days: params.graceDays ?? 0,
      p_price_snapshot: params.priceSnapshot ?? null,
      p_notes: params.notes || null
    });
    if (error) {
      throw error;
    }
  },

  /**
   * Suspend an organization's subscription (Super Admin only)
   */
  async suspendOrgSubscription(orgId: string, notes?: string): Promise<void> {
    const { error } = await supabase.rpc('platform_suspend_organization_subscription', {
      p_org_id: orgId,
      p_notes: notes || null
    });
    if (error) {
      throw error;
    }
  },

  /**
   * Resume a suspended organization's subscription (Super Admin only)
   */
  async resumeOrgSubscription(orgId: string, notes?: string): Promise<void> {
    const { error } = await supabase.rpc('platform_resume_organization_subscription', {
      p_org_id: orgId,
      p_notes: notes || null
    });
    if (error) {
      throw error;
    }
  },

  /**
   * Cancel an organization's subscription (Super Admin only)
   */
  async cancelOrgSubscription(orgId: string, notes?: string): Promise<void> {
    const { error } = await supabase.rpc('platform_cancel_organization_subscription', {
      p_org_id: orgId,
      p_notes: notes || null
    });
    if (error) {
      throw error;
    }
  },

  /**
   * Get subscription dashboard metrics and stats (Super Admin only)
   */
  async getSubscriptionDashboardStats(): Promise<any> {
    const { data, error } = await supabase.rpc('platform_get_subscription_dashboard');
    if (error) {
      throw error;
    }
    return data;
  }
};

export interface PlatformDashboardStats {
  orgs_count: number;
  users_count: number;
  sales_invoices_count: number;
  purchase_bills_count: number;
  receipts_count: number;
  payments_count: number;
  deleted_documents_count: number;
  recent_activities: any[];
  unusual_organizations: any[];
}

export interface PlatformUserRow {
  profile_id: string;
  full_name: string;
  email: string;
  phone: string | null;
  created_at: string;
  organizations_json: Array<{
    org_id: string;
    org_name: string;
    role: string;
    is_active: boolean;
  }>;
}

export interface PlatformOrgMemberRow {
  profile_id: string;
  full_name: string;
  email: string;
  phone: string | null;
  role: string;
  is_active: boolean;
  joined_at: string;
}

export interface PlatformDeletedDocumentRow {
  document_id: string;
  organization_id: string;
  organization_name: string;
  document_type: string;
  document_number: string;
  status: string;
  amount: number;
  currency: string;
  deleted_by_name: string;
  deleted_at: string;
  delete_reason: string | null;
  can_restore: boolean;
}
