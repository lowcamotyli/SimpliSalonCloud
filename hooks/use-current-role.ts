import { useUser, UserContext } from '@/hooks/use-user';
import { Permission, Role, RBAC_ROLES } from '@/lib/rbac/role-maps';

/**
 * Hook to retrieve the current user's role, salon ID, and check permissions.
 */
export const useCurrentRole = () => {
  const { user, isLoading } = useUser();

  const currentRole: Role | undefined = user?.app_metadata.role as Role | undefined;
  const currentPermissions: Permission[] = (user?.app_metadata.permissions || []) as Permission[];
  const salonId = user?.app_metadata.salon_id;

  const hasPermission = (requiredPermission: Permission): boolean => {
    if (isLoading || !user) {
      return false;
    }

    // Check for wildcard permission
    if (currentPermissions.includes('*' as Permission)) {
      return true;
    }

    return currentPermissions.includes(requiredPermission);
  };

  const isOwnerOrManager = (): boolean => {
    return currentRole === RBAC_ROLES.OWNER || currentRole === RBAC_ROLES.MANAGER;
  };

  const isEmployee = (): boolean => {
    return currentRole === RBAC_ROLES.EMPLOYEE;
  };

  return {
    userContext: user,
    currentRole,
    currentPermissions,
    salonId,
    isLoading,
    hasPermission,
    isOwnerOrManager,
    isEmployee
  };
};
