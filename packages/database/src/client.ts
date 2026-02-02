import { createClient, SupabaseClient } from '@supabase/supabase-js';
import type { Database } from './generated/database.types';

export type TypedSupabaseClient = SupabaseClient<Database>;

/**
 * Supabaseクライアント作成（ブラウザ用）
 */
export function createBrowserClient(): TypedSupabaseClient {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  if (!supabaseUrl || !supabaseAnonKey) {
    throw new Error('Missing Supabase environment variables');
  }

  return createClient<Database>(supabaseUrl, supabaseAnonKey, {
    auth: {
      persistSession: true,
      autoRefreshToken: true,
    },
  });
}

/**
 * Supabaseクライアント作成（サーバー用・service_role）
 */
export function createAdminClient(): TypedSupabaseClient {
  const supabaseUrl = process.env.SUPABASE_URL;
  const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!supabaseUrl || !supabaseServiceKey) {
    throw new Error('Missing Supabase admin environment variables');
  }

  return createClient<Database>(supabaseUrl, supabaseServiceKey, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
    },
  });
}

/**
 * テナントコンテキスト設定（service_role用）
 */
export async function setTenantContext(
  client: TypedSupabaseClient,
  tenantId: string
): Promise<void> {
  // Supabase JS v2 の rpc 型推論の制限により型キャストが必要
  // Database型のFunctions定義とSupabaseクライアントの型推論に互換性の問題があるため
  const rpcClient = client as unknown as {
    rpc: (fn: string, params: Record<string, string>) => Promise<{ error: Error | null }>;
  };
  const { error } = await rpcClient.rpc('set_tenant_context', {
    p_tenant_id: tenantId,
  });

  if (error) {
    throw new Error(`Failed to set tenant context: ${error.message}`);
  }
}
