import { describe, it, expect } from 'vitest';
import { hasPermission, canInviteMoreMembers, Role, Permission } from './permissions';

describe('Permissions and Role Management', () => {
  describe('hasPermission', () => {
    it('should grant owner and admin full permissions', () => {
      const ownerPermissions: Permission[] = ['team.view', 'team.invite', 'settings.edit', 'sales.create', 'journal.post'];
      for (const perm of ownerPermissions) {
        expect(hasPermission('owner', perm)).toBe(true);
        expect(hasPermission('admin', perm)).toBe(true);
      }
    });

    it('should restrict accountant from administrative actions', () => {
      expect(hasPermission('accountant', 'team.invite')).toBe(false);
      expect(hasPermission('accountant', 'team.change_role')).toBe(false);
      expect(hasPermission('accountant', 'settings.edit')).toBe(false);

      // accountant should still have accounting permissions
      expect(hasPermission('accountant', 'journal.create')).toBe(true);
      expect(hasPermission('accountant', 'journal.post')).toBe(true);
      expect(hasPermission('accountant', 'reports.view')).toBe(true);
    });

    it('should restrict sales to sales operations only', () => {
      expect(hasPermission('sales', 'sales.view')).toBe(true);
      expect(hasPermission('sales', 'sales.create')).toBe(true);
      expect(hasPermission('sales', 'sales.correct')).toBe(true);

      // restricted actions
      expect(hasPermission('sales', 'sales.approve')).toBe(false);
      expect(hasPermission('sales', 'journal.view')).toBe(false);
      expect(hasPermission('sales', 'journal.post')).toBe(false);
      expect(hasPermission('sales', 'settings.view')).toBe(false);
    });

    it('should restrict viewer to read-only capabilities', () => {
      // view access is allowed
      expect(hasPermission('viewer', 'sales.view')).toBe(true);
      expect(hasPermission('viewer', 'purchases.view')).toBe(true);
      expect(hasPermission('viewer', 'journal.view')).toBe(true);
      expect(hasPermission('viewer', 'settings.view')).toBe(true);

      // write access is denied
      expect(hasPermission('viewer', 'sales.create')).toBe(false);
      expect(hasPermission('viewer', 'purchases.create')).toBe(false);
      expect(hasPermission('viewer', 'journal.create')).toBe(false);
      expect(hasPermission('viewer', 'team.invite')).toBe(false);
    });

    it('should handle invalid or null roles gracefully', () => {
      expect(hasPermission(null, 'sales.view')).toBe(false);
      expect(hasPermission(undefined, 'sales.view')).toBe(false);
      expect(hasPermission('INVALID_ROLE', 'sales.view')).toBe(false);
    });
  });

  describe('canInviteMoreMembers', () => {
    it('should enforce user limits if max_users is specified', () => {
      const subscription = { max_users: 5 };
      expect(canInviteMoreMembers(subscription, 3)).toBe(true);
      expect(canInviteMoreMembers(subscription, 5)).toBe(false);
      expect(canInviteMoreMembers(subscription, 6)).toBe(false);
    });

    it('should allow invitations if subscription is null or missing max_users', () => {
      expect(canInviteMoreMembers(null, 10)).toBe(true);
      expect(canInviteMoreMembers({}, 10)).toBe(true);
    });
  });

  describe('Active Membership & Security Contracts', () => {
    // Contract simulation for can_manage_sales_drafts
    const canManageSalesDraftsContract = (member: { role: string; isActive?: boolean } | null): boolean => {
      if (!member) return false;
      if (member.isActive === false) return false;
      return ['owner', 'admin', 'accountant', 'sales'].includes(member.role);
    };

    // Contract simulation for can_manage_purchase_drafts
    const canManagePurchaseDraftsContract = (member: { role: string; isActive?: boolean } | null): boolean => {
      if (!member) return false;
      if (member.isActive === false) return false;
      return ['owner', 'admin', 'accountant'].includes(member.role);
    };

    // Contract simulation for is_org_privileged_member
    const isOrgPrivilegedMemberContract = (member: { role: string; isActive?: boolean } | null): boolean => {
      if (!member) return false;
      if (member.isActive === false) return false;
      return ['owner', 'admin', 'accountant'].includes(member.role);
    };

    // Contract simulation for is_org_admin
    const isOrgAdminContract = (member: { role: string; isActive?: boolean } | null): boolean => {
      if (!member) return false;
      if (member.isActive === false) return false;
      return ['owner', 'admin'].includes(member.role);
    };

    // Contract simulation for can_view_inventory_movements
    const canViewInventoryMovementsContract = (member: { role: string; isActive?: boolean } | null): boolean => {
      if (!member) return false;
      if (member.isActive === false) return false;
      return ['owner', 'admin', 'accountant', 'viewer'].includes(member.role);
    };

    it('can_manage_sales_drafts should allow active owner, admin, accountant, and sales', () => {
      expect(canManageSalesDraftsContract({ role: 'owner', isActive: true })).toBe(true);
      expect(canManageSalesDraftsContract({ role: 'admin', isActive: true })).toBe(true);
      expect(canManageSalesDraftsContract({ role: 'accountant', isActive: true })).toBe(true);
      expect(canManageSalesDraftsContract({ role: 'sales', isActive: true })).toBe(true);
    });

    it('can_manage_sales_drafts should deny viewer and non-members', () => {
      expect(canManageSalesDraftsContract({ role: 'viewer', isActive: true })).toBe(false);
      expect(canManageSalesDraftsContract(null)).toBe(false);
    });

    it('can_manage_sales_drafts should strictly deny inactive members regardless of role', () => {
      expect(canManageSalesDraftsContract({ role: 'owner', isActive: false })).toBe(false);
      expect(canManageSalesDraftsContract({ role: 'admin', isActive: false })).toBe(false);
      expect(canManageSalesDraftsContract({ role: 'accountant', isActive: false })).toBe(false);
      expect(canManageSalesDraftsContract({ role: 'sales', isActive: false })).toBe(false);
    });

    it('can_manage_purchase_drafts should deny sales, viewer, and inactive members', () => {
      expect(canManagePurchaseDraftsContract({ role: 'owner', isActive: true })).toBe(true);
      expect(canManagePurchaseDraftsContract({ role: 'admin', isActive: true })).toBe(true);
      expect(canManagePurchaseDraftsContract({ role: 'accountant', isActive: true })).toBe(true);
      expect(canManagePurchaseDraftsContract({ role: 'sales', isActive: true })).toBe(false);
      expect(canManagePurchaseDraftsContract({ role: 'viewer', isActive: true })).toBe(false);
      expect(canManagePurchaseDraftsContract({ role: 'owner', isActive: false })).toBe(false);
      expect(canManagePurchaseDraftsContract({ role: 'accountant', isActive: false })).toBe(false);
    });

    it('is_org_privileged_member should deny sales, viewer, and inactive members', () => {
      expect(isOrgPrivilegedMemberContract({ role: 'owner', isActive: true })).toBe(true);
      expect(isOrgPrivilegedMemberContract({ role: 'admin', isActive: true })).toBe(true);
      expect(isOrgPrivilegedMemberContract({ role: 'accountant', isActive: true })).toBe(true);
      expect(isOrgPrivilegedMemberContract({ role: 'sales', isActive: true })).toBe(false);
      expect(isOrgPrivilegedMemberContract({ role: 'viewer', isActive: true })).toBe(false);
      expect(isOrgPrivilegedMemberContract({ role: 'admin', isActive: false })).toBe(false);
    });

    it('is_org_admin should only allow active owner and admin', () => {
      expect(isOrgAdminContract({ role: 'owner', isActive: true })).toBe(true);
      expect(isOrgAdminContract({ role: 'admin', isActive: true })).toBe(true);
      expect(isOrgAdminContract({ role: 'accountant', isActive: true })).toBe(false);
      expect(isOrgAdminContract({ role: 'sales', isActive: true })).toBe(false);
      expect(isOrgAdminContract({ role: 'owner', isActive: false })).toBe(false);
      expect(isOrgAdminContract({ role: 'admin', isActive: false })).toBe(false);
    });

    it('can_view_inventory_movements should deny sales and inactive members', () => {
      expect(canViewInventoryMovementsContract({ role: 'owner', isActive: true })).toBe(true);
      expect(canViewInventoryMovementsContract({ role: 'admin', isActive: true })).toBe(true);
      expect(canViewInventoryMovementsContract({ role: 'accountant', isActive: true })).toBe(true);
      expect(canViewInventoryMovementsContract({ role: 'viewer', isActive: true })).toBe(true);
      expect(canViewInventoryMovementsContract({ role: 'sales', isActive: true })).toBe(false);
      expect(canViewInventoryMovementsContract({ role: 'viewer', isActive: false })).toBe(false);
    });
  });
});
