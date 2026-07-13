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
});
