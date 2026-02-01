import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';

/**
 * システム自己診断ログ取得API
 *
 * GET /api/system/diagnosis-logs
 *
 * Query Parameters:
 *   - limit: 取得件数（デフォルト: 10, 最大: 100）
 *   - offset: オフセット（デフォルト: 0）
 *   - trigger_type: フィルタ（cron / ci / manual）
 *
 * Note: service_role でアクセス（RLSバイパス）
 */
export async function GET(request: NextRequest) {
  try {
    const searchParams = request.nextUrl.searchParams;

    // パラメータ解析
    const limit = Math.min(
      Math.max(1, parseInt(searchParams.get('limit') || '10', 10)),
      100
    );
    const offset = Math.max(0, parseInt(searchParams.get('offset') || '0', 10));
    const triggerType = searchParams.get('trigger_type');

    // Supabase Admin Client（service_role でRLSバイパス）
    const supabase = createAdminClient();

    // クエリ構築
    let query = supabase
      .from('system_self_diagnosis_logs')
      .select(
        `
        id,
        created_at,
        trigger_type,
        system_version,
        issues_total,
        issues_auto_fixed,
        issues_pending_approval,
        summary
      `,
        { count: 'exact' }
      )
      .order('created_at', { ascending: false })
      .range(offset, offset + limit - 1);

    // trigger_type フィルタ
    if (triggerType && ['cron', 'ci', 'manual'].includes(triggerType)) {
      query = query.eq('trigger_type', triggerType);
    }

    const { data, error, count } = await query;

    if (error) {
      console.error('Failed to fetch diagnosis logs:', error);
      return NextResponse.json(
        { error: 'Failed to fetch diagnosis logs', detail: error.message },
        { status: 500 }
      );
    }

    return NextResponse.json({
      logs: data || [],
      pagination: {
        total: count || 0,
        limit,
        offset,
        has_more: (count || 0) > offset + limit,
      },
    });
  } catch (err) {
    console.error('Unexpected error in diagnosis-logs API:', err);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}

/**
 * 特定ログの詳細取得（full_report含む）
 *
 * GET /api/system/diagnosis-logs?id=<uuid>
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { id } = body;

    if (!id) {
      return NextResponse.json(
        { error: 'Missing required field: id' },
        { status: 400 }
      );
    }

    const supabase = createAdminClient();

    const { data, error } = await supabase
      .from('system_self_diagnosis_logs')
      .select('*')
      .eq('id', id)
      .single();

    if (error) {
      if (error.code === 'PGRST116') {
        return NextResponse.json(
          { error: 'Diagnosis log not found' },
          { status: 404 }
        );
      }
      console.error('Failed to fetch diagnosis log:', error);
      return NextResponse.json(
        { error: 'Failed to fetch diagnosis log', detail: error.message },
        { status: 500 }
      );
    }

    return NextResponse.json({ log: data });
  } catch (err) {
    console.error('Unexpected error in diagnosis-logs API:', err);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
