// Role-based permission definitions

type Role = string;

const menuPermissions: Record<string, Role[]> = {
  '/':            ['super_admin', 'admin', 'operator', 'business', 'readonly'],
  '/ips':         ['super_admin', 'admin', 'operator', 'business', 'readonly'],
  '/products':    ['super_admin', 'admin', 'operator'],
  '/wechat-orders': ['super_admin', 'admin', 'operator', 'business', 'readonly'],
  '/content':     ['super_admin', 'admin', 'operator'],
  '/recycle-bin': ['super_admin', 'admin'],
  '/users':       ['super_admin', 'admin'],
  '/settings':    ['super_admin'],
};

const actionPermissions: Record<string, Role[]> = {
  'ip:create':        ['super_admin', 'admin', 'operator'],
  'ip:edit':          ['super_admin', 'admin', 'operator'],
  'ip:delete':        ['super_admin', 'admin', 'operator'],
  'material:upload':  ['super_admin', 'admin', 'operator'],
  'material:delete':  ['super_admin', 'admin', 'operator'],
  'material:batch':   ['super_admin', 'admin', 'operator'],
  'tag:manage':       ['super_admin', 'admin', 'operator'],
  'user:manage':      ['super_admin', 'admin'],
  'settings:manage':  ['super_admin'],
  'account:switch':   ['super_admin', 'admin'],
};

export function canAccessMenu(role: string | undefined, path: string): boolean {
  if (!role) return false;
  // Check exact match first, then prefix match for sub-paths like /ips/[id]
  const allowed = menuPermissions[path];
  if (allowed) return allowed.includes(role);
  // For paths like /ips/123, check /ips
  const base = Object.keys(menuPermissions).find(k => k !== '/' && path.startsWith(k));
  if (base) return menuPermissions[base].includes(role);
  return false;
}

export function canPerform(role: string | undefined, action: string): boolean {
  if (!role) return false;
  const allowed = actionPermissions[action];
  if (!allowed) return false;
  return allowed.includes(role);
}
