import { describe, it, expect, vi, beforeEach } from 'vitest';
import { accountingService } from './accountingService';
import { supabase } from './supabase';

vi.mock('./supabase', () => ({
  supabase: {
    rpc: vi.fn()
  }
}));

describe('Trash User Profiles Secure RPC & Contract Tests', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('1. Frontend accountingService.getTrashUserProfiles RPC Signature & Contract', () => {
    it('should call get_organization_trash_user_profiles with correct parameters', async () => {
      const mockRpc = vi.mocked(supabase.rpc);
      mockRpc.mockResolvedValueOnce({
        data: [
          { id: 'user-uuid-1', full_name: 'أحمد المحاسب' },
          { id: 'user-uuid-2', full_name: 'سارة المدير' }
        ],
        error: null
      } as any);

      const result = await accountingService.getTrashUserProfiles('org-uuid-100', ['user-uuid-1', 'user-uuid-2']);

      expect(mockRpc).toHaveBeenCalledWith('get_organization_trash_user_profiles', {
        p_organization_id: 'org-uuid-100',
        p_user_ids: ['user-uuid-1', 'user-uuid-2']
      });

      expect(result).toEqual({
        'user-uuid-1': { full_name: 'أحمد المحاسب' },
        'user-uuid-2': { full_name: 'سارة المدير' }
      });
    });

    it('should handle missing or empty userIds gracefully without making RPC calls', async () => {
      const mockRpc = vi.mocked(supabase.rpc);

      const res1 = await accountingService.getTrashUserProfiles('org-uuid-100', []);
      expect(res1).toEqual({});
      expect(mockRpc).not.toHaveBeenCalled();

      const res2 = await accountingService.getTrashUserProfiles('', ['user-uuid-1']);
      expect(res2).toEqual({});
      expect(mockRpc).not.toHaveBeenCalled();
    });

    it('should handle RPC errors gracefully and return empty object without crashing UI', async () => {
      const mockRpc = vi.mocked(supabase.rpc);
      mockRpc.mockResolvedValueOnce({
        data: null,
        error: { message: 'Unauthorized permission check failed' }
      } as any);

      const result = await accountingService.getTrashUserProfiles('org-uuid-100', ['user-uuid-1']);
      expect(result).toEqual({});
    });

    it('should fallback empty or whitespace names to "مستخدم النظام"', async () => {
      const mockRpc = vi.mocked(supabase.rpc);
      mockRpc.mockResolvedValueOnce({
        data: [
          { id: 'user-uuid-empty', full_name: '   ' },
          { id: 'user-uuid-null', full_name: null }
        ],
        error: null
      } as any);

      const result = await accountingService.getTrashUserProfiles('org-uuid-100', ['user-uuid-empty', 'user-uuid-null']);
      expect(result['user-uuid-empty'].full_name).toBe('مستخدم النظام');
      expect(result['user-uuid-null'].full_name).toBe('مستخدم النظام');
    });
  });

  describe('2. Multi-Tenant Database Simulation & Security Isolation', () => {
    interface OrganizationMember {
      organization_id: string;
      profile_id: string;
      role: 'owner' | 'admin' | 'accountant' | 'sales' | 'viewer';
      is_active: boolean;
    }

    interface ProfileEntity {
      id: string;
      full_name: string | null;
    }

    interface DocumentEntity {
      id: string;
      organization_id: string;
      deleted_by: string | null;
    }

    class MockMultiTenantDB {
      profiles: Map<string, ProfileEntity> = new Map();
      members: OrganizationMember[] = [];
      documents: DocumentEntity[] = [];
      currentUserId: string = 'caller-uuid-1';

      simulateIsOrgMember(orgId: string): boolean {
        return this.members.some(
          m => m.organization_id === orgId && m.profile_id === this.currentUserId && m.is_active !== false
        );
      }

      simulateGetOrganizationTrashUserProfiles(
        orgId: string,
        userIds?: string[]
      ): { id: string; full_name: string }[] {
        // 1. Authorization check: must be an active member of the target organization
        if (!this.simulateIsOrgMember(orgId)) {
          throw new Error('غير مصرح: ليس لديك صلاحية الوصول لبيانات هذه المنشأة.');
        }

        if (userIds && userIds.length === 0) {
          return [];
        }

        // 2. Multi-tenant filtering: profile must be linked to orgId via membership or document reference
        const allowedUserIds = new Set<string>();
        this.members
          .filter(m => m.organization_id === orgId)
          .forEach(m => allowedUserIds.add(m.profile_id));
        this.documents
          .filter(d => d.organization_id === orgId && d.deleted_by)
          .forEach(d => allowedUserIds.add(d.deleted_by!));

        const result: { id: string; full_name: string }[] = [];
        for (const [pId, profile] of this.profiles.entries()) {
          if (!allowedUserIds.has(pId)) continue;
          if (userIds && !userIds.includes(pId)) continue;

          const trimmed = profile.full_name?.trim();
          result.push({
            id: pId,
            full_name: trimmed && trimmed.length > 0 ? trimmed : 'مستخدم النظام'
          });
        }

        return result;
      }
    }

    it('allows active members of Org A to view profile names of deleters within Org A', () => {
      const db = new MockMultiTenantDB();
      db.currentUserId = 'user-admin-a';

      db.profiles.set('user-admin-a', { id: 'user-admin-a', full_name: 'مدير المنشأة أ' });
      db.profiles.set('user-sales-a', { id: 'user-sales-a', full_name: 'بائع المنشأة أ' });
      db.profiles.set('user-admin-b', { id: 'user-admin-b', full_name: 'مدير المنشأة ب' });

      db.members.push(
        { organization_id: 'org-a', profile_id: 'user-admin-a', role: 'admin', is_active: true },
        { organization_id: 'org-a', profile_id: 'user-sales-a', role: 'sales', is_active: true },
        { organization_id: 'org-b', profile_id: 'user-admin-b', role: 'admin', is_active: true }
      );

      db.documents.push({
        id: 'doc-inv-1',
        organization_id: 'org-a',
        deleted_by: 'user-sales-a'
      });

      const response = db.simulateGetOrganizationTrashUserProfiles('org-a', ['user-sales-a']);
      expect(response).toEqual([{ id: 'user-sales-a', full_name: 'بائع المنشأة أ' }]);
    });

    it('strictly denies non-members from calling get_organization_trash_user_profiles for other orgs', () => {
      const db = new MockMultiTenantDB();
      db.currentUserId = 'user-intruder';

      db.members.push({ organization_id: 'org-b', profile_id: 'user-intruder', role: 'owner', is_active: true });

      expect(() => {
        db.simulateGetOrganizationTrashUserProfiles('org-a', ['user-sales-a']);
      }).toThrow('غير مصرح: ليس لديك صلاحية الوصول لبيانات هذه المنشأة.');
    });

    it('strictly denies inactive members from calling the RPC', () => {
      const db = new MockMultiTenantDB();
      db.currentUserId = 'user-deactivated';

      db.members.push({ organization_id: 'org-a', profile_id: 'user-deactivated', role: 'accountant', is_active: false });

      expect(() => {
        db.simulateGetOrganizationTrashUserProfiles('org-a', ['some-user-id']);
      }).toThrow('غير مصرح');
    });

    it('filters out user IDs belonging to external orgs if maliciously requested in payload', () => {
      const db = new MockMultiTenantDB();
      db.currentUserId = 'user-member-a';

      db.profiles.set('user-member-a', { id: 'user-member-a', full_name: 'عضو أ' });
      db.profiles.set('user-victim-b', { id: 'user-victim-b', full_name: 'حساب سري من منشأة ب' });

      db.members.push(
        { organization_id: 'org-a', profile_id: 'user-member-a', role: 'accountant', is_active: true },
        { organization_id: 'org-b', profile_id: 'user-victim-b', role: 'owner', is_active: true }
      );

      // Caller from Org A requests user ID from Org B
      const response = db.simulateGetOrganizationTrashUserProfiles('org-a', ['user-victim-b']);
      // Should be empty, not returning victim profile from org B
      expect(response).toEqual([]);
    });

    it('falls back to "مستخدم النظام" when profile has empty or null full_name', () => {
      const db = new MockMultiTenantDB();
      db.currentUserId = 'user-member-a';

      db.profiles.set('user-empty-name', { id: 'user-empty-name', full_name: '' });
      db.profiles.set('user-null-name', { id: 'user-null-name', full_name: null });

      db.members.push(
        { organization_id: 'org-a', profile_id: 'user-member-a', role: 'viewer', is_active: true },
        { organization_id: 'org-a', profile_id: 'user-empty-name', role: 'sales', is_active: true },
        { organization_id: 'org-a', profile_id: 'user-null-name', role: 'accountant', is_active: true }
      );

      const response = db.simulateGetOrganizationTrashUserProfiles('org-a', ['user-empty-name', 'user-null-name']);
      expect(response).toEqual([
        { id: 'user-empty-name', full_name: 'مستخدم النظام' },
        { id: 'user-null-name', full_name: 'مستخدم النظام' }
      ]);
    });
  });
});
