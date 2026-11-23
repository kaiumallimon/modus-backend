export interface PermissionDefinition {
  id: string;
  name: string;
  description: string;
  module: string;
}

export const CORE_PERMISSIONS: PermissionDefinition[] = [
  // Users
  {
    id: 'users.read',
    name: 'View Users',
    description: 'Read user list and details',
    module: 'users',
  },
  {
    id: 'users.create',
    name: 'Create Users',
    description: 'Create new users',
    module: 'users',
  },
  {
    id: 'users.update',
    name: 'Update Users',
    description: 'Update user profiles and roles',
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
    description: 'Full administrative access to users',
    module: 'users',
  },

  // Roles & Permissions
  {
    id: 'roles.read',
    name: 'View Roles',
    description: 'Read roles and permission assignments',
    module: 'access-control',
  },
  {
    id: 'roles.create',
    name: 'Create Roles',
    description: 'Create new custom roles',
    module: 'access-control',
  },
  {
    id: 'roles.update',
    name: 'Update Roles',
    description: 'Modify roles and permission mappings',
    module: 'access-control',
  },
  {
    id: 'roles.delete',
    name: 'Delete Roles',
    description: 'Delete custom roles',
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
    description: 'Read system-wide application settings',
    module: 'system-settings',
  },
  {
    id: 'settings.update',
    name: 'Update System Settings',
    description: 'Modify system-wide application settings',
    module: 'system-settings',
  },

  // Organization
  {
    id: 'organization.read',
    name: 'View Organization Profile',
    description: 'Read organization information and settings',
    module: 'organization-settings',
  },
  {
    id: 'organization.update',
    name: 'Update Organization Profile',
    description: 'Modify organization information and settings',
    module: 'organization-settings',
  },

  // Modules
  {
    id: 'modules.read',
    name: 'View Module Registry',
    description: 'View registered modules and their statuses',
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
    description: 'Read system audit and event logs',
    module: 'audit-log',
  },
];
