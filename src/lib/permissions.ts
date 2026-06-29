export type Role = 'owner' | 'admin' | 'accountant' | 'sales' | 'viewer';

export type Permission =
  | 'team.view'
  | 'team.invite'
  | 'team.change_role'
  | 'team.deactivate'
  | 'settings.view'
  | 'settings.edit'
  | 'sales.view'
  | 'sales.create'
  | 'sales.approve'
  | 'sales.correct'
  | 'purchases.view'
  | 'purchases.create'
  | 'purchases.approve'
  | 'journal.view'
  | 'journal.create'
  | 'journal.post'
  | 'reports.view'
  | 'zatca.view'
  | 'zatca.manage';

const permissionsMap: Record<Role, Record<Permission, boolean>> = {
  owner: {
    'team.view': true,
    'team.invite': true,
    'team.change_role': true,
    'team.deactivate': true,
    'settings.view': true,
    'settings.edit': true,
    'sales.view': true,
    'sales.create': true,
    'sales.approve': true,
    'sales.correct': true,
    'purchases.view': true,
    'purchases.create': true,
    'purchases.approve': true,
    'journal.view': true,
    'journal.create': true,
    'journal.post': true,
    'reports.view': true,
    'zatca.view': true,
    'zatca.manage': true,
  },
  admin: {
    'team.view': true,
    'team.invite': true,
    'team.change_role': true,
    'team.deactivate': true,
    'settings.view': true,
    'settings.edit': true,
    'sales.view': true,
    'sales.create': true,
    'sales.approve': true,
    'sales.correct': true,
    'purchases.view': true,
    'purchases.create': true,
    'purchases.approve': true,
    'journal.view': true,
    'journal.create': true,
    'journal.post': true,
    'reports.view': true,
    'zatca.view': true,
    'zatca.manage': true,
  },
  accountant: {
    'team.view': true,
    'team.invite': false,
    'team.change_role': false,
    'team.deactivate': false,
    'settings.view': true,
    'settings.edit': false,
    'sales.view': true,
    'sales.create': true,
    'sales.approve': true,
    'sales.correct': true,
    'purchases.view': true,
    'purchases.create': true,
    'purchases.approve': true,
    'journal.view': true,
    'journal.create': true,
    'journal.post': true,
    'reports.view': true,
    'zatca.view': true,
    'zatca.manage': false,
  },
  sales: {
    'team.view': false,
    'team.invite': false,
    'team.change_role': false,
    'team.deactivate': false,
    'settings.view': false,
    'settings.edit': false,
    'sales.view': true,
    'sales.create': true,
    'sales.approve': false,
    'sales.correct': true, // basic correct copy for invoices/receipts of sales
    'purchases.view': false,
    'purchases.create': false,
    'purchases.approve': false,
    'journal.view': false,
    'journal.create': false,
    'journal.post': false,
    'reports.view': false,
    'zatca.view': false,
    'zatca.manage': false,
  },
  viewer: {
    'team.view': true,
    'team.invite': false,
    'team.change_role': false,
    'team.deactivate': false,
    'settings.view': true,
    'settings.edit': false,
    'sales.view': true,
    'sales.create': false,
    'sales.approve': false,
    'sales.correct': false,
    'purchases.view': true,
    'purchases.create': false,
    'purchases.approve': false,
    'journal.view': true,
    'journal.create': false,
    'journal.post': false,
    'reports.view': true,
    'zatca.view': true,
    'zatca.manage': false,
  },
};

export function hasPermission(role: string | null | undefined, permission: Permission): boolean {
  if (!role) return false;
  const normalizedRole = (role.toLowerCase()) as Role;
  const rolePermissions = permissionsMap[normalizedRole];
  if (!rolePermissions) return false;
  return rolePermissions[permission] || false;
}

export function canInviteMoreMembers(subscription: any, currentMemberCount: number): boolean {
  if (subscription && typeof subscription === 'object' && 'max_users' in subscription) {
    return currentMemberCount < (subscription.max_users as number);
  }
  return true;
}
