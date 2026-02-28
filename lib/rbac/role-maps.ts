// Role names as defined in public.profiles.role (string)
export const RBAC_ROLES = {
  OWNER: 'owner',
  MANAGER: 'manager',
  EMPLOYEE: 'employee',
} as const

// Permissions mapped to roles (as stored in JWT raw_app_meta_data.permissions)
export const ROLE_PERMISSIONS = {
  [RBAC_ROLES.OWNER]: ['*'] as const, // Wildcard for full access
  [RBAC_ROLES.MANAGER]: [
    'calendar:view',
    'calendar:manage_all',
    'clients:view',
    'clients:manage',
    'employees:manage',
    'services:manage',
    'finance:view',
    'reports:view',
    'settings:view',
  ] as const,
  [RBAC_ROLES.EMPLOYEE]: [
    'calendar:view',
    'calendar:manage_own',
    'clients:view',
    'services:view',
  ] as const,
} as const

// Type definitions derived from the keys for safety
export type Role = (typeof RBAC_ROLES)[keyof typeof RBAC_ROLES]
export type Permission = (typeof ROLE_PERMISSIONS)[Role][number]
export type PermissionMap = Record<Role, readonly Permission[]>

// Helper function to get the full role map
export function getRolePermissions(): PermissionMap {
  return ROLE_PERMISSIONS as PermissionMap
}