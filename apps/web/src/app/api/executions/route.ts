import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { getAuthenticatedUser } from '@/lib/auth/helpers';

/**
 * 実行一覧API
 *
 * GET /api/executions
 *
 * Query Parameters:
 * - state: 実行状態でフィルタ (COMPLETED, FAILED, RUNNING, etc.)
 * - skill_key: スキルキーでフィルタ
 * - executor_type: 実行者タイプでフィルタ (user, agent, system)
 * - from: 開始日時 (ISO8601)
 * - to: 終了日時 (ISO8601)
 * - limit: 取得件数 (default: 50, max: 100)
 * - offset: オフセット (default: 0)
 */
export async function GET(request: NextRequest) {
  try {
    // 認証チェック
    const user = await getAuthenticatedUser();
    if (!user) {
      return NextResponse.json(
        { error: 'Unauthorized' },
        { status: 401 }
      );
    }

    const { searchParams } = new URL(request.url);

    // パラメータ取得
    const state = searchParams.get('state');
    const skillKey = searchParams.get('skill_key');
    const executorType = searchParams.get('executor_type');
    const from = searchParams.get('from');
    const to = searchParams.get('to');
    const limit = Math.min(
      parseInt(searchParams.get('limit') || '50', 10),
      100
    );
    const offset = parseInt(searchParams.get('offset') || '0', 10);

    const supabase = createAdminClient();

    // クエリ構築
    let query = supabase
      .from('skill_executions')
      .select(
        'id, idempotency_key, skill_key, skill_version, executor_type, executor_id, state, result_status, result_summary, error_code, error_message, created_at, started_at, completed_at, budget_consumed_amount',
        { count: 'exact' }
      )
      .order('created_at', { ascending: false });

    // フィルタ適用
    if (state) {
      query = query.eq('state', state);
    }

    if (skillKey) {
      query = query.eq('skill_key', skillKey);
    }

    if (executorType) {
      query = query.eq('executor_type', executorType);
    }

    if (from) {
      query = query.gte('created_at', from);
    }

    if (to) {
      query = query.lte('created_at', to);
    }

    // ページネーション
    query = query.range(offset, offset + limit - 1);

    const { data, count, error } = await query;

    if (error) {
      console.error('[API] Failed to fetch executions:', error);
      return NextResponse.json(
        { error: 'Failed to fetch executions' },
        { status: 500 }
      );
    }

    return NextResponse.json({
      executions: data || [],
      total: count || 0,
      limit,
      offset,
    });
  } catch (error) {
    console.error('[API] Unexpected error:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
