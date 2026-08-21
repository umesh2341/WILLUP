import { useQuery } from '@tanstack/react-query';
import { supabase } from '../lib/supabaseClient';
import { api } from '../lib/api';
import { useAuth } from './useAuth';

export interface Role {
  id: string;
  name: string;
  domain: string;
  order: number;
  escalationMinutes?: number | null;
}

export interface RoleAssignment {
  id: string;
  userId: string;
  roleId: string;
  role?: Role;
}

/**
 * Fetches the active user's RoleAssignments per §14.
 * This determines UI visibility without a separate custom frontend permission system.
 */
export function useRoleAssignments() {
  const { user, session } = useAuth();
  const userId = user?.id || session?.user?.id;

  const {
    data: roles = [],
    isLoading,
    error,
    refetch,
  } = useQuery({
    queryKey: ['roleAssignments', userId],
    enabled: !!userId,
    staleTime: Infinity, // Fetch once at session start per §14
    queryFn: async (): Promise<Role[]> => {
      if (!userId) return [];

      // 1. Try fetching via authenticated REST API
      try {
        const res = await api.users.getMe();
        if (res?.roles && Array.isArray(res.roles)) {
          return res.roles as Role[];
        }
      } catch (apiErr) {
        console.warn('REST API roles fetch error, trying direct Supabase query:', apiErr);
      }

      // 2. Direct Supabase Query Fallback
      try {
        const { data, error: queryError } = await supabase
          .from('RoleAssignment')
          .select(`
            id,
            roleId,
            role:Role (
              id,
              name,
              domain,
              order,
              escalationMinutes
            )
          `)
          .eq('userId', userId);

        if (!queryError && data) {
          const extractedRoles: Role[] = data
            .map((item: any) => item.role)
            .filter((r: any): r is Role => !!r);
          return extractedRoles;
        }
      } catch (supaErr) {
        console.warn('Supabase direct query failed:', supaErr);
      }

      return [];
    },
  });

  const roleNames = roles.map((r) => r.name);
  const isHOD = roleNames.some((r) => r.toLowerCase() === 'hod');
  const isWarden = roleNames.some((r) => r.toLowerCase() === 'warden');
  const isAdmin = roleNames.some((r) =>
    ['system admin', 'superadmin', 'admin', 'administrator', 'hod'].includes(r.toLowerCase())
  );
  const isFaculty = roleNames.some((r) => r.toLowerCase().includes('faculty') || r.toLowerCase().includes('instructor'));
  const isStaff = roles.length > 0;


  return {
    roles,
    roleNames,
    isLoading,
    error,
    refetch,
    // Convenience helper flags
    isAdmin,
    isHOD,
    isWarden,
    isFaculty,
    isStaff,
  };
}

export default useRoleAssignments;
