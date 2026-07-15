import { useState, useEffect } from 'react';
import { useAuth } from '../context/AuthContext';
import { platformService, ClientSubscriptionInfo } from '../lib/platformService';

export interface UseOrganizationSubscriptionResult {
  subscription: ClientSubscriptionInfo | null;
  status: 'trial' | 'active' | 'past_due' | 'suspended' | 'cancelled' | null;
  plan: {
    code: string;
    name_ar: string;
    name_en: string | null;
    features: Record<string, boolean>;
    max_users: number | null;
    max_branches?: number | null;
    max_invoices_per_month?: number | null;
  } | null;
  isActive: boolean;
  isTrial: boolean;
  isSuspended: boolean;
  loading: boolean;
  error: string | null;
  refetch: () => Promise<void>;
}

export function useOrganizationSubscription(): UseOrganizationSubscriptionResult {
  const { currentOrg } = useAuth();
  const [subscription, setSubscription] = useState<ClientSubscriptionInfo | null>(null);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);

  const fetchSubscription = async () => {
    if (!currentOrg?.id) {
      setSubscription(null);
      setLoading(false);
      return;
    }

    try {
      setLoading(true);
      setError(null);
      const sub = await platformService.getOrganizationSubscription(currentOrg.id);
      setSubscription(sub);
    } catch (err: any) {
      console.error('Error fetching organization subscription:', err);
      setError(err?.message || 'فشل في تحميل تفاصيل الاشتراك.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchSubscription();
  }, [currentOrg?.id]);

  const status = (subscription?.status as 'trial' | 'active' | 'past_due' | 'suspended' | 'cancelled' | null) || null;
  const plan = subscription?.plan || null;

  // Active means status is active OR trial
  const isActive = status === 'active' || status === 'trial';
  const isTrial = status === 'trial';
  const isSuspended = status === 'suspended';

  return {
    subscription,
    status,
    plan,
    isActive,
    isTrial,
    isSuspended,
    loading,
    error,
    refetch: fetchSubscription,
  };
}
