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
  price_monthly: number;
  price_yearly: number;
  max_users: number | null;
  max_invoices: number | null;
  features: Record<string, boolean>;
  is_active: boolean;
  sort_order: number;
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
  status: 'trial' | 'active' | 'past_due' | 'suspended' | 'cancelled';
  billing_cycle: 'monthly' | 'yearly' | 'manual';
  starts_at: string | null;
  ends_at: string | null;
  trial_ends_at: string | null;
  created_at: string;
  plan: {
    code: string;
    name_ar: string;
    name_en: string | null;
    features: Record<string, boolean>;
  } | null;
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
    const defaultTrialFallback = (reason: string): ClientSubscriptionInfo => {
      console.warn(`[Subscription] Using default trial fallback (${reason}) for org: ${orgId}`);
      return {
        id: 'fallback-trial-id',
        organization_id: orgId,
        plan_id: 'free_trial',
        status: 'trial',
        billing_cycle: 'monthly',
        starts_at: new Date().toISOString(),
        ends_at: new Date(Date.now() + 14 * 24 * 60 * 60 * 1000).toISOString(),
        trial_ends_at: new Date(Date.now() + 14 * 24 * 60 * 60 * 1000).toISOString(),
        created_at: new Date().toISOString(),
        plan: {
          code: 'free_trial',
          name_ar: 'فترة تجريبية مجانية',
          name_en: 'Free Trial',
          features: {
            zatca: true,
            inventory: true,
            reports: true
          }
        }
      };
    };

    try {
      const { data, error } = await supabase.rpc('get_my_organization_subscription', {
        p_org_id: orgId
      });

      if (error) {
        return defaultTrialFallback(error.message || String(error));
      }

      if (!data || data.length === 0) {
        return defaultTrialFallback('No active subscription found in DB');
      }

      const result = data[0];
      return {
        id: result.subscription_id,
        organization_id: result.organization_id,
        plan_id: result.plan_id,
        status: result.status,
        billing_cycle: result.billing_cycle,
        starts_at: result.starts_at,
        ends_at: result.ends_at,
        trial_ends_at: result.trial_ends_at,
        created_at: result.created_at,
        plan: result.plan_code ? {
          code: result.plan_code,
          name_ar: result.plan_name_ar,
          name_en: result.plan_name_en,
          features: result.plan_features || {}
        } : null
      };
    } catch (err: any) {
      return defaultTrialFallback(err?.message || String(err));
    }
  }
};
