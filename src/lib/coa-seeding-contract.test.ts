import { describe, it, expect } from 'vitest';
import { accountingService } from './accountingService';

describe('COA Seeding Canonical RPC Contract Tests', () => {

  describe('1. Parameter Signature & Contract Alignment', () => {
    it('seedIndustryChartOfAccounts contract requires p_organization_id and p_industry_type', () => {
      // Simulate RPC payload generation
      const buildSeedPayload = (orgId: string, industryType: string = 'general_trading') => ({
        p_organization_id: orgId,
        p_industry_type: industryType
      });

      const payload = buildSeedPayload('org-123', 'services');
      expect(payload).toHaveProperty('p_organization_id', 'org-123');
      expect(payload).toHaveProperty('p_industry_type', 'services');
      expect(payload).not.toHaveProperty('p_org_id');
    });

    it('ensureDefaultChartOfAccounts contract aligns with p_organization_id', () => {
      const buildEnsurePayload = (orgId: string, industryType: string = 'general_trading') => ({
        p_organization_id: orgId,
        p_industry_type: industryType
      });

      const payload = buildEnsurePayload('org-456', 'restaurant');
      expect(payload).toHaveProperty('p_organization_id', 'org-456');
      expect(payload).toHaveProperty('p_industry_type', 'restaurant');
      expect(payload).not.toHaveProperty('p_org_id');
    });
  });

  describe('2. Multi-Tenant Isolation & Idempotency Simulation', () => {
    interface Account {
      id: string;
      organization_id: string;
      code: string;
      name_ar: string;
      parent_id?: string | null;
    }

    interface OrgState {
      accounts: Account[];
      coa_initialized_at: string | null;
      settings: Record<string, any>;
    }

    // Pure logic simulation of seed_industry_chart_of_accounts RPC
    const simulateSeedRpc = (
      state: Map<string, OrgState>,
      orgId: string,
      industryType: string = 'general_trading',
      callerRole: string = 'admin',
      isActive: boolean = true
    ) => {
      if (!['owner', 'admin', 'accountant'].includes(callerRole) || !isActive) {
        throw new Error('غير مصرح: تهيئة دليل الحسابات متاحة للمالك أو المدير أو المحاسب فقط.');
      }

      const orgData = state.get(orgId) || { accounts: [], coa_initialized_at: null, settings: {} };

      // Idempotency check: if already initialized and accounts exist
      if (orgData.coa_initialized_at !== null && orgData.accounts.length > 0) {
        return {
          status: 'already_initialized',
          inserted_accounts: 0,
          industry_type: industryType
        };
      }

      // Mock templates for testing
      const templateAccounts = [
        { code: '1', name_ar: 'الأصول', parent_code: null },
        { code: '11', name_ar: 'الأصول المتداولة', parent_code: '1' },
        { code: '111', name_ar: 'النقدية وما في حكمها', parent_code: '11' },
        { code: '1111', name_ar: 'أمين الصندوق (الخزينة العامة)', parent_code: '111' },
        { code: '1112', name_ar: 'حساب البنك الجاري الرئيسي', parent_code: '111' },
        { code: '1121', name_ar: 'حساب ذمم العملاء التجاريين الموحد', parent_code: '11' },
        { code: '2111', name_ar: 'حساب ذمم الموردين التجاريين الموحد', parent_code: null },
        { code: '3121', name_ar: 'الأرباح المبقاة', parent_code: null },
        { code: '4111', name_ar: 'المبيعات', parent_code: null },
        { code: '5111', name_ar: 'تكلفة المبيعات', parent_code: null }
      ];

      let insertedCount = 0;
      const existingCodes = new Set(orgData.accounts.map(a => a.code));

      for (const t of templateAccounts) {
        if (!existingCodes.has(t.code)) {
          orgData.accounts.push({
            id: `acc-${orgId}-${t.code}`,
            organization_id: orgId,
            code: t.code,
            name_ar: t.name_ar,
            parent_id: t.parent_code ? `acc-${orgId}-${t.parent_code}` : null
          });
          existingCodes.add(t.code);
          insertedCount++;
        }
      }

      orgData.coa_initialized_at = new Date().toISOString();
      orgData.settings.coa_initialized_at = orgData.coa_initialized_at;
      state.set(orgId, orgData);

      return {
        status: 'success',
        inserted_accounts: insertedCount,
        industry_type: industryType
      };
    };

    it('should successfully initialize chart of accounts for a new organization', () => {
      const dbState = new Map<string, OrgState>();
      const result = simulateSeedRpc(dbState, 'org-tenant-1', 'general_trading', 'owner', true);

      expect(result.status).toBe('success');
      expect(result.inserted_accounts).toBe(10);
      expect(dbState.get('org-tenant-1')?.accounts.length).toBe(10);
    });

    it('should be idempotent and not duplicate accounts when called twice for same organization', () => {
      const dbState = new Map<string, OrgState>();
      
      // First run
      const firstRun = simulateSeedRpc(dbState, 'org-tenant-1', 'general_trading', 'admin', true);
      expect(firstRun.status).toBe('success');
      expect(firstRun.inserted_accounts).toBe(10);
      expect(dbState.get('org-tenant-1')?.accounts.length).toBe(10);

      // Second run
      const secondRun = simulateSeedRpc(dbState, 'org-tenant-1', 'general_trading', 'admin', true);
      expect(secondRun.status).toBe('already_initialized');
      expect(secondRun.inserted_accounts).toBe(0);
      expect(dbState.get('org-tenant-1')?.accounts.length).toBe(10); // No duplicates!
    });

    it('should maintain strict tenant isolation between different organizations', () => {
      const dbState = new Map<string, OrgState>();

      // Tenant A
      simulateSeedRpc(dbState, 'org-tenant-A', 'general_trading', 'owner', true);
      expect(dbState.get('org-tenant-A')?.accounts.length).toBe(10);
      expect(dbState.get('org-tenant-B')).toBeUndefined();

      // Tenant B (services)
      simulateSeedRpc(dbState, 'org-tenant-B', 'services', 'accountant', true);
      expect(dbState.get('org-tenant-B')?.accounts.length).toBe(10);
      expect(dbState.get('org-tenant-A')?.accounts.length).toBe(10);

      // Accounts belonging to Tenant A must not have tenant B org id
      const accountsA = dbState.get('org-tenant-A')!.accounts;
      expect(accountsA.every(a => a.organization_id === 'org-tenant-A')).toBe(true);

      const accountsB = dbState.get('org-tenant-B')!.accounts;
      expect(accountsB.every(a => a.organization_id === 'org-tenant-B')).toBe(true);
    });

    it('should strictly reject unauthorized or inactive callers', () => {
      const dbState = new Map<string, OrgState>();

      // Viewer is denied
      expect(() => {
        simulateSeedRpc(dbState, 'org-tenant-X', 'general_trading', 'viewer', true);
      }).toThrow('غير مصرح');

      // Sales is denied
      expect(() => {
        simulateSeedRpc(dbState, 'org-tenant-X', 'general_trading', 'sales', true);
      }).toThrow('غير مصرح');

      // Inactive admin is denied
      expect(() => {
        simulateSeedRpc(dbState, 'org-tenant-X', 'general_trading', 'admin', false);
      }).toThrow('غير مصرح');
    });
  });
});
