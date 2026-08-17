import { describe, it, expect, vi, beforeEach } from 'vitest';
import { platformService } from './platformService';
import { supabase } from './supabase';

vi.mock('./supabase', () => ({
  supabase: {
    rpc: vi.fn(),
    from: vi.fn(() => ({
      select: vi.fn().mockReturnThis(),
      order: vi.fn().mockResolvedValue({ data: [], error: null })
    }))
  }
}));

describe('Platform Subscription Plans RPC Contract & Business Logic Tests', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('1. RPC Parameter Signature Alignment (Contract Tests)', () => {
    it('platform_update_subscription_plan MUST pass p_id, not p_plan_id', async () => {
      const mockRpc = vi.mocked(supabase.rpc);
      mockRpc.mockResolvedValueOnce({ data: null, error: null } as any);

      const planParams = {
        code: 'PRO-2026',
        nameAr: 'الباقة المتقدمة',
        nameEn: 'Professional Plan',
        descriptionAr: 'للمنشآت المتوسطة',
        descriptionEn: 'For medium enterprises',
        planType: 'paid' as const,
        billingInterval: 'monthly' as const,
        durationDays: 30,
        price: 199.99,
        currencyCode: 'SAR',
        trialDays: 0,
        maxUsers: 10,
        maxBranches: 3,
        maxInvoicesPerMonth: 500,
        features: { zatca_phase2: true, multi_currency: true },
        isActive: true,
        isPublic: true,
        isDefaultTrial: false,
        sortOrder: 2
      };

      await platformService.updatePlan('plan-uuid-123', planParams);

      expect(mockRpc).toHaveBeenCalledTimes(1);
      const [rpcName, payload] = mockRpc.mock.calls[0];

      expect(rpcName).toBe('platform_update_subscription_plan');
      expect(payload).toHaveProperty('p_id', 'plan-uuid-123');
      expect(payload).not.toHaveProperty('p_plan_id');
      expect(payload).toMatchObject({
        p_id: 'plan-uuid-123',
        p_code: 'PRO-2026',
        p_price: 199.99,
        p_max_users: 10,
        p_features: { zatca_phase2: true, multi_currency: true }
      });
    });

    it('platform_archive_subscription_plan MUST pass p_id, not p_plan_id', async () => {
      const mockRpc = vi.mocked(supabase.rpc);
      mockRpc.mockResolvedValueOnce({ data: null, error: null } as any);

      await platformService.archivePlan('plan-uuid-456');

      expect(mockRpc).toHaveBeenCalledTimes(1);
      const [rpcName, payload] = mockRpc.mock.calls[0];

      expect(rpcName).toBe('platform_archive_subscription_plan');
      expect(payload).toHaveProperty('p_id', 'plan-uuid-456');
      expect(payload).not.toHaveProperty('p_plan_id');
    });

    it('platform_restore_subscription_plan MUST pass p_id, not p_plan_id', async () => {
      const mockRpc = vi.mocked(supabase.rpc);
      mockRpc.mockResolvedValueOnce({ data: null, error: null } as any);

      await platformService.restorePlan('plan-uuid-789');

      expect(mockRpc).toHaveBeenCalledTimes(1);
      const [rpcName, payload] = mockRpc.mock.calls[0];

      expect(rpcName).toBe('platform_restore_subscription_plan');
      expect(payload).toHaveProperty('p_id', 'plan-uuid-789');
      expect(payload).not.toHaveProperty('p_plan_id');
    });

    it('platform_create_subscription_plan sends all expected creation fields', async () => {
      const mockRpc = vi.mocked(supabase.rpc);
      mockRpc.mockResolvedValueOnce({ data: 'new-plan-id', error: null } as any);

      const newPlan = {
        code: 'BASIC-2026',
        nameAr: 'الباقة الأساسية',
        nameEn: 'Basic Plan',
        descriptionAr: 'للمنشآت الصغيرة',
        descriptionEn: 'For small businesses',
        planType: 'paid' as const,
        billingInterval: 'monthly' as const,
        durationDays: 30,
        price: 99.0,
        currencyCode: 'SAR',
        trialDays: 0,
        maxUsers: 3,
        maxBranches: 1,
        maxInvoicesPerMonth: 100,
        features: { zatca_phase1: true },
        isActive: true,
        isPublic: true,
        isDefaultTrial: false,
        sortOrder: 1
      };

      const result = await platformService.createPlan(newPlan);

      expect(result).toBe('new-plan-id');
      expect(mockRpc).toHaveBeenCalledWith('platform_create_subscription_plan', {
        p_code: 'BASIC-2026',
        p_name_ar: 'الباقة الأساسية',
        p_name_en: 'Basic Plan',
        p_description_ar: 'للمنشآت الصغيرة',
        p_description_en: 'For small businesses',
        p_plan_type: 'paid',
        p_billing_interval: 'monthly',
        p_duration_days: 30,
        p_price: 99.0,
        p_currency_code: 'SAR',
        p_trial_days: 0,
        p_max_users: 3,
        p_max_branches: 1,
        p_max_invoices_per_month: 100,
        p_features: { zatca_phase1: true },
        p_is_active: true,
        p_is_public: true,
        p_is_default_trial: false,
        p_sort_order: 1
      });
    });
  });

  describe('2. Business Logic Simulation of PostgreSQL Plan RPCs', () => {
    interface PlanEntity {
      id: string;
      code: string;
      name_ar: string;
      price: number;
      max_users: number | null;
      max_branches: number | null;
      max_invoices_per_month: number | null;
      features: Record<string, boolean>;
      is_active: boolean;
      is_public: boolean;
      is_default_trial: boolean;
      archived_at: string | null;
      plan_type: string;
    }

    class MockPlatformDatabase {
      plans: Map<string, PlanEntity> = new Map();
      isSuperAdmin: boolean = true;

      simulateCreatePlan(planData: Omit<PlanEntity, 'id' | 'archived_at'>): string {
        if (!this.isSuperAdmin) {
          throw new Error('غير مصرح لك بإجراء هذه العملية الإدارية.');
        }
        if (planData.price < 0) {
          throw new Error('السعر لا يمكن أن يكون سالباً.');
        }

        if (planData.is_default_trial && planData.is_active) {
          for (const p of this.plans.values()) {
            if (p.is_default_trial && !p.archived_at) {
              p.is_default_trial = false;
            }
          }
        }

        const id = `plan-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`;
        this.plans.set(id, {
          ...planData,
          id,
          archived_at: null
        });
        return id;
      }

      simulateUpdatePlan(p_id: string, updates: Partial<PlanEntity>): void {
        if (!this.isSuperAdmin) {
          throw new Error('غير مصرح لك بإجراء هذه العملية الإدارية.');
        }
        const plan = this.plans.get(p_id);
        if (!plan) {
          throw new Error('الباقة المحددة غير موجودة.');
        }
        if (updates.price !== undefined && updates.price < 0) {
          throw new Error('السعر لا يمكن أن يكون سالباً.');
        }

        if (updates.is_default_trial && updates.is_active) {
          for (const [id, p] of this.plans.entries()) {
            if (id !== p_id && p.is_default_trial && !p.archived_at) {
              p.is_default_trial = false;
            }
          }
        }

        Object.assign(plan, updates);
      }

      simulateArchivePlan(p_id: string): void {
        if (!this.isSuperAdmin) {
          throw new Error('غير مصرح لك بإجراء هذه العملية الإدارية.');
        }
        const plan = this.plans.get(p_id);
        if (!plan) {
          throw new Error('الباقة المحددة غير موجودة.');
        }

        // Check if only active default trial
        if (plan.is_default_trial) {
          const activeTrialCount = Array.from(this.plans.values()).filter(
            p => p.is_default_trial && p.is_active && !p.archived_at
          ).length;
          if (activeTrialCount <= 1) {
            throw new Error('لا يمكن أرشفة باقة التجربة الافتراضية لأنها الباقة الوحيدة النشطة حالياً.');
          }
        }

        plan.archived_at = new Date().toISOString();
        plan.is_active = false;
      }

      simulateRestorePlan(p_id: string): void {
        if (!this.isSuperAdmin) {
          throw new Error('غير مصرح لك بإجراء هذه العملية الإدارية.');
        }
        const plan = this.plans.get(p_id);
        if (!plan) {
          throw new Error('الباقة المحددة غير موجودة.');
        }
        plan.archived_at = null;
        plan.is_active = true;
      }
    }

    it('creates, updates price, limits, and features on a plan', () => {
      const db = new MockPlatformDatabase();
      const planId = db.simulateCreatePlan({
        code: 'BASIC',
        name_ar: 'الأساسية',
        price: 50,
        max_users: 2,
        max_branches: 1,
        max_invoices_per_month: 50,
        features: { standard_reports: true },
        is_active: true,
        is_public: true,
        is_default_trial: false,
        plan_type: 'paid'
      });

      expect(db.plans.get(planId)?.price).toBe(50);
      expect(db.plans.get(planId)?.max_users).toBe(2);

      // Update price, limits, features
      db.simulateUpdatePlan(planId, {
        price: 75,
        max_users: 5,
        max_branches: 2,
        max_invoices_per_month: 200,
        features: { standard_reports: true, advanced_analytics: true }
      });

      const updated = db.plans.get(planId);
      expect(updated?.price).toBe(75);
      expect(updated?.max_users).toBe(5);
      expect(updated?.max_branches).toBe(2);
      expect(updated?.max_invoices_per_month).toBe(200);
      expect(updated?.features.advanced_analytics).toBe(true);
    });

    it('enforces default trial exclusivity across plans', () => {
      const db = new MockPlatformDatabase();
      const trial1 = db.simulateCreatePlan({
        code: 'TRIAL-1',
        name_ar: 'تجربة 1',
        price: 0,
        max_users: 1,
        max_branches: 1,
        max_invoices_per_month: 20,
        features: {},
        is_active: true,
        is_public: true,
        is_default_trial: true,
        plan_type: 'trial'
      });

      expect(db.plans.get(trial1)?.is_default_trial).toBe(true);

      // Create second plan as default trial -> previous becomes false
      const trial2 = db.simulateCreatePlan({
        code: 'TRIAL-2',
        name_ar: 'تجربة 2',
        price: 0,
        max_users: 1,
        max_branches: 1,
        max_invoices_per_month: 20,
        features: {},
        is_active: true,
        is_public: true,
        is_default_trial: true,
        plan_type: 'trial'
      });

      expect(db.plans.get(trial2)?.is_default_trial).toBe(true);
      expect(db.plans.get(trial1)?.is_default_trial).toBe(false);
    });

    it('archives and restores a plan correctly', () => {
      const db = new MockPlatformDatabase();
      const planId = db.simulateCreatePlan({
        code: 'ENTERPRISE',
        name_ar: 'المؤسسات',
        price: 999,
        max_users: null,
        max_branches: null,
        max_invoices_per_month: null,
        features: { all: true },
        is_active: true,
        is_public: true,
        is_default_trial: false,
        plan_type: 'paid'
      });

      db.simulateArchivePlan(planId);
      expect(db.plans.get(planId)?.is_active).toBe(false);
      expect(db.plans.get(planId)?.archived_at).toBeTruthy();

      db.simulateRestorePlan(planId);
      expect(db.plans.get(planId)?.is_active).toBe(true);
      expect(db.plans.get(planId)?.archived_at).toBeNull();
    });

    it('strictly denies non-super-admin users from all plan actions', () => {
      const db = new MockPlatformDatabase();
      db.isSuperAdmin = false; // Non-super admin caller

      expect(() => {
        db.simulateCreatePlan({
          code: 'TEST',
          name_ar: 'تجريبي',
          price: 10,
          max_users: 1,
          max_branches: 1,
          max_invoices_per_month: 10,
          features: {},
          is_active: true,
          is_public: true,
          is_default_trial: false,
          plan_type: 'paid'
        });
      }).toThrow('غير مصرح لك');

      expect(() => {
        db.simulateUpdatePlan('plan-1', { price: 20 });
      }).toThrow('غير مصرح لك');

      expect(() => {
        db.simulateArchivePlan('plan-1');
      }).toThrow('غير مصرح لك');

      expect(() => {
        db.simulateRestorePlan('plan-1');
      }).toThrow('غير مصرح لك');
    });
  });
});
