import { createClient } from '@supabase/supabase-js';
import type { Database } from '@ai-company-os/database';

/**
 * 管理用Supabaseクライアント（service_role）
 * サーバーサイドでのみ使用
 */
export function createAdminClient() {
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
 * テナントコンテキスト設定
 */
export async function setTenantContext(
  client: ReturnType<typeof createAdminClient>,
  tenantId: string
) {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { error } = await (client as any).rpc('set_tenant_context', {
    p_tenant_id: tenantId,
  });

  if (error) {
    throw new Error(`Failed to set tenant context: ${error.message}`);
  }
}
