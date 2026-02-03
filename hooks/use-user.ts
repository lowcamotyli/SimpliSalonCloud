import { createClient } from '@/lib/supabase/client';
import { useQuery } from '@tanstack/react-query';
import { Role, ROLE_PERMISSIONS } from '@/lib/rbac/role-maps';

// Rozszerzenie typu User z Supabase o Custom Claims
export interface UserContext {
  id: string;
  email: string | undefined;
  app_metadata: {
    role: Role;
    permissions: string[];
    salon_id: string;
  };
  raw_user: NonNullable<Awaited<ReturnType<ReturnType<typeof createClient>['auth']['getUser']>>['data']['user']>;
}

const fetchUserContext = async (): Promise<UserContext | null> => {
  const supabase = createClient();
  const { data: { session } } = await supabase.auth.getSession();
  
  if (!session) {
    return null;
  }
  
  const user = session.user;

  // Zapewnienie, że app_metadata ma wymagane pola
  const appMetadata = user.app_metadata as Partial<UserContext['app_metadata']>;
  const roleFromMetadata = appMetadata?.role as Role | undefined;
  const salonIdFromMetadata = appMetadata?.salon_id as string | undefined;
  const permissionsFromMetadata = appMetadata?.permissions as string[] | undefined;

  if (!roleFromMetadata || !salonIdFromMetadata || !permissionsFromMetadata) {
    const { data: profile, error: profileError } = await supabase
      .from('profiles')
      .select('role, salon_id')
      .eq('user_id', user.id)
      .single();

    if (profileError || !profile) {
      return null;
    }

    const resolvedProfile = profile as { role: Role; salon_id: string };
    const resolvedRole = resolvedProfile.role;
    const resolvedPermissions = [...ROLE_PERMISSIONS[resolvedRole]];

    return {
      id: user.id,
      email: user.email,
      app_metadata: {
        role: resolvedRole,
        permissions: resolvedPermissions,
        salon_id: resolvedProfile.salon_id,
      },
      raw_user: user,
    };
  }

  return {
    id: user.id,
    email: user.email,
    app_metadata: {
      role: roleFromMetadata,
      permissions: permissionsFromMetadata,
      salon_id: salonIdFromMetadata,
    },
    raw_user: user,
  };
};

export const useUser = () => {
  const { data: user, isLoading, error } = useQuery({
    queryKey: ['user-context'],
    queryFn: fetchUserContext,
    staleTime: 1000 * 60 * 5, // 5 minut
    refetchOnWindowFocus: true,
  });

  return { user, isLoading, error };
};
