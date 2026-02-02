import { createServerSupabaseClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';

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

    // getUser() を使用してトークンを検証（getSession() は検証しない）
    const {
      data: { user },
      error,
    } = await supabase.auth.getUser();

    if (error || !user) {
      return null;
    }

    // usersテーブルからユーザー情報を取得（RLSバイパスのためadminクライアント使用）
    const adminClient = createAdminClient();
    const { data: userData } = await adminClient
      .from('users')
      .select('id, email, role, display_name, tenant_id')
      .eq('id', user.id)
      .single();

    // usersテーブルにレコードがある場合はそれを返す
    if (userData) {
      return userData as AuthenticatedUser;
    }

    // usersテーブルにレコードがない場合は、Supabase Authの情報から基本的なユーザー情報を返す
    // これにより、usersテーブルへの登録が完了していなくてもダッシュボードにアクセス可能
    return {
      id: user.id,
      email: user.email || '',
      role: 'member',
      display_name: user.user_metadata?.display_name || null,
      tenant_id: 'default',
    };
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
