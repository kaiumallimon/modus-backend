export interface PermissionDefinition {
  id: string;
  name: string;
  description: string;
  module: string;
}

export interface ModulePermissionsGroup {
  module: string;
  moduleName: string;
  description: string;
  permissions: PermissionDefinition[];
}

export const MODULE_NAMES: Record<string, { name: string; description: string }> = {
  users: {
    name: 'User Management',
    description: 'Manage users, accounts, profile information, and credentials',
  },
  'access-control': {
    name: 'Access Control (RBAC)',
    description: 'Manage system and custom roles, permissions, and authorization policies',
  },
  'system-settings': {
    name: 'System Settings',
    description: 'Application-level preferences, formatting, and defaults',
  },
  'module-registry': {
    name: 'Module Registry',
    description: 'Inspect and manage activation of integrated core and business modules',
  },
  'audit-log': {
    name: 'Audit Logging',
    description: 'Inspect immutable historical security and administrative events',
  },
  cdn: {
    name: 'Cloudflare CDN & Storage',
    description: 'Inspect assets, manage files, and monitor CDN usage metrics',
  },
};

export const CORE_PERMISSIONS: PermissionDefinition[] = [
  // Users
  {
    id: 'users.read',
    name: 'View Users',
    description: 'Read user list, profiles, and account details',
    module: 'users',
  },
  {
    id: 'users.create',
    name: 'Create Users',
    description: 'Create new users and dispatch welcome credentials',
    module: 'users',
  },
  {
    id: 'users.update',
    name: 'Update Users',
    description: 'Update user profiles, details, and roles',
    module: 'users',
  },
  {
    id: 'users.delete',
    name: 'Delete Users',
    description: 'Delete or deactivate user accounts',
    module: 'users',
  },
  {
    id: 'users.manage',
    name: 'Manage Users',
    description: 'Full administrative access to users and role assignments',
    module: 'users',
  },

  // Roles & Permissions
  {
    id: 'roles.read',
    name: 'View Roles',
    description: 'Read roles, permission assignments, and role user statistics',
    module: 'access-control',
  },
  {
    id: 'roles.create',
    name: 'Create Roles',
    description: 'Create new custom roles with designated permissions',
    module: 'access-control',
  },
  {
    id: 'roles.update',
    name: 'Update Roles',
    description: 'Modify role details, names, active state, and permissions',
    module: 'access-control',
  },
  {
    id: 'roles.delete',
    name: 'Delete Roles',
    description: 'Delete custom roles that have no active users assigned',
    module: 'access-control',
  },
  {
    id: 'roles.manage',
    name: 'Manage Roles',
    description: 'Full administrative access to roles and access control',
    module: 'access-control',
  },

  // Settings
  {
    id: 'settings.read',
    name: 'View System Settings',
    description: 'Read system-wide application settings and preferences',
    module: 'system-settings',
  },
  {
    id: 'settings.update',
    name: 'Update System Settings',
    description: 'Modify system-wide application settings and preferences',
    module: 'system-settings',
  },


  // Modules
  {
    id: 'modules.read',
    name: 'View Module Registry',
    description: 'View registered modules, dependencies, and their statuses',
    module: 'module-registry',
  },
  {
    id: 'modules.manage',
    name: 'Manage Modules',
    description: 'Activate or deactivate system modules',
    module: 'module-registry',
  },

  // Audit Logs
  {
    id: 'audit.read',
    name: 'View Audit Logs',
    description: 'Read system audit and security event logs',
    module: 'audit-log',
  },

  // Cloudflare CDN & Storage
  {
    id: 'cdn.read',
    name: 'View CDN Explorer',
    description: 'Inspect CDN assets, folders, file previews, and usage analytics',
    module: 'cdn',
  },
  {
    id: 'cdn.manage',
    name: 'Manage CDN Assets',
    description: 'Upload, delete, and manage files in the Cloudflare CDN bucket',
    module: 'cdn',
  },
];
