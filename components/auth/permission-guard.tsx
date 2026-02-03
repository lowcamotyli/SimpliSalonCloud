'use client';

import { Permission, usePermission } from '@/hooks/use-permission';
import { ReactNode } from 'react';
import { Loader2 } from 'lucide-react';
// Zaimportuj EmptyState jeśli jest potrzebny, ale prosty div jest wystarczający dla Guard
// import { EmptyState } from '@/components/ui/empty-state'; 

interface PermissionGuardProps {
  children: ReactNode;
  permission: Permission | Permission[]; // Uprawnienie lub lista uprawnień (OR)
  fallback?: ReactNode; // Komponent do wyświetlenia w przypadku braku uprawnień
  requireAll?: boolean; // Jeśli true, wymaga wszystkich podanych uprawnień (AND)
}

export const PermissionGuard = ({ 
  children, 
  permission, 
  fallback = (
    <div className="flex items-center justify-center h-40 border border-dashed rounded-lg bg-red-50/50">
      <p className="text-sm text-red-600">Brak uprawnień do wyświetlenia tej sekcji.</p>
    </div>
  ),
  requireAll = false 
}: PermissionGuardProps) => {
  const { hasPermission, isLoading, isAuthorized } = usePermission();
  
  // 1. Ładowanie
  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-40">
        <Loader2 className="h-6 w-6 animate-spin text-primary" />
      </div>
    );
  }
  
  // 2. Wymagane uprawnienie
  const permissionsToCheck = Array.isArray(permission) ? permission : [permission];
  
  if (permissionsToCheck.length === 0) {
    // Jeśli nie podano uprawnień, renderuj normalnie (zabezpieczenie)
    return <>{children}</>;
  }

  const isAccessGranted = requireAll
    ? permissionsToCheck.every(p => hasPermission(p))
    : permissionsToCheck.some(p => hasPermission(p));
  
  if (!isAuthorized || !isAccessGranted) {
    return <>{fallback}</>;
  }
  
  return <>{children}</>;
};
