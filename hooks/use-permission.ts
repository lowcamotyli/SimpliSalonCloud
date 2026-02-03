'use client';

import { useMemo } from 'react';
import { useUser, UserContext } from './use-user'; 

// Definicje typów uprawnień
export type Role = UserContext['app_metadata']['role'];

export type Permission = 
  | '*' // Wildcard dla Ownera
  | 'calendar:view' 
  | 'calendar:manage_all' 
  | 'calendar:manage_own'
  | 'clients:view' 
  | 'clients:manage'
  | 'finance:view' 
  | 'finance:manage'
  | 'employees:manage'
  | 'roles:manage'
  | 'settings:manage';

export const usePermission = () => {
  const { user, isLoading } = useUser();

  const permissions = user?.app_metadata?.permissions || [];
  const role = user?.app_metadata?.role;
  
  const hasPermission = (permission: Permission): boolean => {
    // Brak użytkownika lub ładowanie - brak uprawnień
    if (!user || isLoading) return false; 
    
    // Sprawdzenie wildcard: Owner ma dostęp do wszystkiego
    if (permissions.includes('*')) return true;
    
    return permissions.includes(permission);
  };

  const hasRole = (requiredRole: Role): boolean => {
    if (!user || isLoading) return false;
    return role === requiredRole;
  };
  
  // Pomocnicza funkcja do sprawdzania wielu uprawnień (OR)
  const hasAnyPermission = (requiredPermissions: Permission[]): boolean => {
    return requiredPermissions.some(p => hasPermission(p));
  };

  // Używamy useMemo dla stabilności w przypadku przekazywania do komponentów
  const memoizedPermissions = useMemo(() => ({
    hasPermission, 
    hasRole, 
    hasAnyPermission, 
    user, 
    role,
    isLoading,
    isAuthorized: !!user && !isLoading // true, jeśli użytkownik jest zalogowany i załadowany
  }), [user, isLoading, role]); // Musimy uważać na zależności useMemo, hasPermission/hasRole są funkcjami bazującymi na user/isLoading/role.

  return memoizedPermissions;
};
