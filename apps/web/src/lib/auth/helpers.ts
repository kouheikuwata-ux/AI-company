import { createServerSupabaseClient } from '@/lib/supabase/server';

export interface AuthenticatedUser {
  id: string;
  email: string;
  role: 'owner' | 'admin' | 'member';
  display_name: string | null;
  tenant_id: string;
}

/**
 * 認証済みユーザーを取得
 * @returns ユーザー情報（認証済みの場合）、null（未認証の場合）
 */
export async function getAuthenticatedUser(): Promise<AuthenticatedUser | null> {
  try {
    const supabase = createServerSupabaseClient();
    const {
      data: { session },
    } = await supabase.auth.getSession();

    if (!session) {
      return null;
    }

    const { data: userData } = await supabase
      .from('users')
      .select('id, email, role, display_name, tenant_id')
      .eq('id', session.user.id)
      .single();

    return userData as AuthenticatedUser | null;
  } catch {
    return null;
  }
}

/**
 * 管理者権限を持つ認証済みユーザーを取得
 * @returns ユーザー情報（admin/owner の場合）、null（それ以外）
 */
export async function getAdminUser(): Promise<AuthenticatedUser | null> {
  const user = await getAuthenticatedUser();

  if (!user || !['admin', 'owner'].includes(user.role)) {
    return null;
  }

  return user;
}

/**
 * ロール権限チェック
 */
export function hasRole(user: AuthenticatedUser | null, roles: string[]): boolean {
  return user !== null && roles.includes(user.role);
}
